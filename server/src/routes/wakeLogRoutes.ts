import { Router, Response } from 'express';
import prisma from '../prisma.js';
import { dismissLogSchema } from '../utils/validation.js';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

// Record a successful dismissal
router.post('/dismiss', async (req: AuthRequest, res: Response) => {
  const result = dismissLogSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const { alarmId, scheduledTime, responseTimeSeconds, dismissalType, success } = result.data;

  try {
    const log = await prisma.wakeLog.create({
      data: {
        userId: req.userId!,
        alarmId: alarmId ?? null,
        scheduledTime,
        responseTimeSeconds,
        dismissalType,
        success,
      },
    });

    // Compute streak
    const logs = await prisma.wakeLog.findMany({
      where: {
        userId: req.userId!,
        success: true,
      },
      orderBy: { dismissedAt: 'desc' },
      take: 60,
    });

    let currentStreak = 0;
    const daySet = new Set<string>();

    for (const item of logs) {
      const dayKey = item.dismissedAt.toISOString().split('T')[0];
      if (!daySet.has(dayKey)) {
        daySet.add(dayKey);
        // Only count if wake response was within 10 minutes (600s)
        if (item.responseTimeSeconds <= 600) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    return res.status(201).json({
      log,
      currentStreak,
      message: 'Alarm verified and dismissed. No snooze permitted.',
    });
  } catch (err) {
    console.error('Dismissal log error:', err);
    return res.status(500).json({ error: 'Failed to record dismissal' });
  }
});

// Retrieve wake streaks and sleep window insights
router.get('/insights', async (req: AuthRequest, res: Response) => {
  try {
    const logs = await prisma.wakeLog.findMany({
      where: { userId: req.userId!, success: true },
      orderBy: { dismissedAt: 'asc' },
      take: 30,
    });

    // Calculate current streak
    const reversedLogs = [...logs].reverse();
    let currentStreak = 0;
    const daySet = new Set<string>();

    for (const item of reversedLogs) {
      const dayKey = item.dismissedAt.toISOString().split('T')[0];
      if (!daySet.has(dayKey)) {
        daySet.add(dayKey);
        if (item.responseTimeSeconds <= 600) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Build sleep window proxy: time between previous dismissal and current morning alarm
    const sleepWindows: { date: string; hours: number; responseTimeSeconds: number }[] = [];
    for (let i = 0; i < logs.length; i++) {
      const current = logs[i];
      const dateStr = current.dismissedAt.toISOString().split('T')[0];
      // Estimate sleep window based on scheduled time vs approximate evening (or previous day log)
      let estimatedHours = 7.5;
      if (i > 0) {
        const diffMs = current.dismissedAt.getTime() - logs[i - 1].dismissedAt.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours >= 4 && diffHours <= 14) {
          estimatedHours = Math.round(diffHours * 10) / 10;
        }
      }

      sleepWindows.push({
        date: dateStr,
        hours: estimatedHours,
        responseTimeSeconds: current.responseTimeSeconds,
      });
    }

    return res.json({
      currentStreak,
      totalDismissals: logs.length,
      sleepWindows,
    });
  } catch (err) {
    console.error('Insights fetch error:', err);
    return res.status(500).json({ error: 'Failed to retrieve insights' });
  }
});

export default router;
