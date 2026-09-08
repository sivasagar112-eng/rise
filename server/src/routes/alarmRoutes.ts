import { Router, Response } from 'express';
import prisma from '../prisma.js';
import { alarmSchema, updateAlarmSchema } from '../utils/validation.js';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticateToken);

// List alarms
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const alarms = await prisma.alarm.findMany({
      where: { userId: req.userId },
      orderBy: { time: 'asc' },
    });

    // Format daysOfWeek from JSON string to array
    const formattedAlarms = alarms.map((alarm) => ({
      ...alarm,
      daysOfWeek: JSON.parse(alarm.daysOfWeek),
    }));

    return res.json({ alarms: formattedAlarms });
  } catch (err) {
    console.error('Fetch alarms error:', err);
    return res.status(500).json({ error: 'Failed to fetch alarms' });
  }
});

// Create alarm
router.post('/', async (req: AuthRequest, res: Response) => {
  const result = alarmSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const data = result.data;

  try {
    const created = await prisma.alarm.create({
      data: {
        userId: req.userId!,
        time: data.time,
        label: data.label,
        daysOfWeek: JSON.stringify(data.daysOfWeek),
        dismissalType: data.dismissalType,
        pushupTarget: data.pushupTarget,
        referenceDescriptor: data.referenceDescriptor ?? null,
        rampDuration: data.rampDuration,
        preAlarmEnabled: data.preAlarmEnabled,
        isEnabled: data.isEnabled,
      },
    });

    return res.status(201).json({
      alarm: {
        ...created,
        daysOfWeek: JSON.parse(created.daysOfWeek),
      },
    });
  } catch (err) {
    console.error('Create alarm error:', err);
    return res.status(500).json({ error: 'Failed to create alarm' });
  }
});

// Update alarm
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = updateAlarmSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const data = result.data;

  try {
    const existing = await prisma.alarm.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Alarm not found' });
    }

    const updated = await prisma.alarm.update({
      where: { id },
      data: {
        ...(data.time !== undefined && { time: data.time }),
        ...(data.label !== undefined && { label: data.label }),
        ...(data.daysOfWeek !== undefined && { daysOfWeek: JSON.stringify(data.daysOfWeek) }),
        ...(data.dismissalType !== undefined && { dismissalType: data.dismissalType }),
        ...(data.pushupTarget !== undefined && { pushupTarget: data.pushupTarget }),
        ...(data.referenceDescriptor !== undefined && { referenceDescriptor: data.referenceDescriptor }),
        ...(data.rampDuration !== undefined && { rampDuration: data.rampDuration }),
        ...(data.preAlarmEnabled !== undefined && { preAlarmEnabled: data.preAlarmEnabled }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      },
    });

    return res.json({
      alarm: {
        ...updated,
        daysOfWeek: JSON.parse(updated.daysOfWeek),
      },
    });
  } catch (err) {
    console.error('Update alarm error:', err);
    return res.status(500).json({ error: 'Failed to update alarm' });
  }
});

// Toggle alarm enabled state
router.patch('/:id/toggle', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.alarm.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Alarm not found' });
    }

    const updated = await prisma.alarm.update({
      where: { id },
      data: { isEnabled: !existing.isEnabled },
    });

    return res.json({
      alarm: {
        ...updated,
        daysOfWeek: JSON.parse(updated.daysOfWeek),
      },
    });
  } catch (err) {
    console.error('Toggle alarm error:', err);
    return res.status(500).json({ error: 'Failed to toggle alarm' });
  }
});

// Delete alarm
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.alarm.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Alarm not found' });
    }

    await prisma.alarm.delete({ where: { id } });
    return res.json({ success: true, message: 'Alarm deleted' });
  } catch (err) {
    console.error('Delete alarm error:', err);
    return res.status(500).json({ error: 'Failed to delete alarm' });
  }
});

export default router;
