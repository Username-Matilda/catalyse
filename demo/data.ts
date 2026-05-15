import path from 'path'
import os from 'os'

export const DEMO_PORT = 3099
export const BASE_URL = `http://localhost:${DEMO_PORT}`
export const DEMO_DB_DIR = path.join(os.tmpdir(), 'catalyse_demo')
export const DEMO_DB_PATH = path.join(DEMO_DB_DIR, 'catalyse.db')
export const ADMIN_EMAIL = 'admin@example.com'
export const ADMIN_PASSWORD = 'admin1'
export const OUT_DIR = path.join(process.cwd(), 'demo-videos')
export const SPEED = 1 // <1 = slower, >1 = faster

export const APPLICANT = {
  name: 'Alex Chen',
  email: 'alex.chen@example.com',
  password: 'DemoPassword1',
  applicationMessage:
    "I've been following PauseAI's work for two years and believe AI safety is the defining challenge of our time. I'm a software engineer with ML experience and want to contribute to advocacy, technical writing, and community coordination.",
  bio: 'Software engineer focused on AI safety. Based in London.',
  discord: 'alexchen#4291',
  contactNotes: "Just let me know you're from PauseAI when you message.",
  location: 'London, UK',
  country: 'United Kingdom',
  localGroup: 'London',
  availability: '8',
}

export const REJECT_APPLICANT = {
  name: 'Jordan Smith',
  email: 'jordan.smith@example.com',
  password: 'DemoPassword1',
  applicationMessage: 'I want to join to promote my startup and grow my network.',
}

export const DEMO_VIDEO_TITLE = 'Volunteer Signup & Approval Flow'
