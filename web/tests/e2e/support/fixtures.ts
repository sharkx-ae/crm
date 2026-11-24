// Fixtures shared by the fake api and the stubbed Playwright specs. Invented people and clients; no real data.
import type { Locale, Role } from '../../../src/contracts/common.ts';
import type { ProjectDetail } from '../../../src/contracts/projects.ts';

const LUMIERE = '0b6f7c1e-4d2a-4f3b-9a1c-1e2d3c4b5a60';
const PEARL = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

const weekdays = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  open: day <= 5,
  from: '09:00',
  to: '18:00',
}));

const users: {
  userId: string;
  email: string;
  name: string;
  role: Role;
  projectIds: string[];
  /** The saved language (users.locale). */
  locale: Locale;
}[] = [
  {
    userId: '3c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    email: 'client@example.test',
    name: 'Lina Haddad',
    role: 'client',
    projectIds: [LUMIERE],
    locale: 'en',
  },
  {
    userId: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e',
    email: 'admin@example.test',
    name: 'Agency Admin',
    role: 'super_admin',
    projectIds: [],
    locale: 'en',
  },
  {
    userId: '8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b',
    email: 'manager-fr@example.test',
    name: 'Rami Haddad',
    role: 'manager',
    projectIds: [],
    locale: 'fr',
  },
];

const projects: ProjectDetail[] = [
  {
    id: LUMIERE,
    name: 'Lumière Aesthetics',
    city: 'Dubai',
    industry: 'Aesthetic clinic',
    color: '#e70101',
    timezone: 'Asia/Dubai',
    businessHours: weekdays,
  },
  {
    id: PEARL,
    name: 'Pearl Derma Clinic',
    city: 'Abu Dhabi',
    industry: 'Dermatology',
    color: '#1c0f0f',
    timezone: 'Asia/Dubai',
    businessHours: weekdays,
  },
];

export const FIXTURE = {
  password: 'Correct-horse-1234',
  code: '123456',
  users,
  projects,
  ids: { lumiere: LUMIERE, pearl: PEARL },
};
