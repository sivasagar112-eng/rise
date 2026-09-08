import { Router, Response } from 'express';
import prisma from '../prisma.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { registerSchema, loginSchema } from '../utils/validation.js';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', async (req, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const { email, password } = result.data;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        alarms: {
          create: {
            time: '07:00',
            label: 'Morning Rise',
            daysOfWeek: JSON.stringify([1, 2, 3, 4, 5]),
            dismissalType: 'PUSHUP_MATH',
            pushupTarget: 5,
            rampDuration: 30,
            preAlarmEnabled: false,
            isEnabled: true,
          }
        }
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      }
    });

    const token = generateToken(user.id, user.email);
    return res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', async (req, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const { email, password } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id, user.email);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to authenticate' });
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

export default router;
