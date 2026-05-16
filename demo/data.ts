export const DEMO_PORT = 3099
export const BASE_URL = `http://localhost:${DEMO_PORT}`
export const ADMIN_EMAIL = 'admin@example.com'
export const ADMIN_PASSWORD = 'admin1'
export const NOREPLY_EMAIL = 'noreply@pauseai.uk'
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
  preferredContact: 'Discord',
  adminNotes: 'Strong application. ML background, two years following the org, clear on the mission.',
  skills: new Set([
    'Software Engineering',
    'Writing',
    'AI Governance Research',
    'Technical AI Safety Expertise',
  ]),
}

export const REJECT_APPLICANT = {
  name: 'Jordan Smith',
  email: 'jordan.smith@example.com',
  password: 'DemoPassword1',
  applicationMessage: "I'm building an AI startup and care deeply about doing it responsibly. I'd love to connect with like-minded people — and if any of you are interested in trying our product, even better!",
  bio: 'Founder of Meridian AI. Building responsible AI tools for enterprise. Always looking for early adopters.',
  discordHandle: 'jordansmith#7734',
  contactPreference: 'discord',
  contactNotes: 'Always happy to chat — especially if you work in AI governance or product.',
  availabilityHoursPerWeek: '3',
  location: 'San Francisco, CA',
  country: 'United States',
  adminNotes: 'Seems that the application is mostly about finding users for their startup.',
  rejectionMessage: "Thank you for applying. After careful review, we don't think this is the right fit at this time.",
}
