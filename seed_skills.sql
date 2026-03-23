-- Catalyse: Pre-populated Skills Taxonomy for PauseAI UK
-- Run this after schema.sql to populate initial skills

-- ============================================
-- SKILL CATEGORIES
-- ============================================

INSERT INTO skill_categories (name, description, sort_order) VALUES
    ('Communications', 'Writing, media, and public-facing skills', 1),
    ('Organizing', 'Event planning, community building, and coordination', 2),
    ('Advocacy & Policy', 'Political engagement and lobbying', 3),
    ('Legal', 'Legal expertise and compliance', 4),
    ('Governance', 'Strategic and organizational leadership', 5),
    ('Technical', 'Software, web, and data skills', 6),
    ('Research', 'Investigation, analysis, and content creation', 7),
    ('Operations', 'Project management and administrative support', 8);

-- ============================================
-- SKILLS BY CATEGORY
-- ============================================

-- Communications (category_id = 1)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (1, 'Writing', 'Blog posts, articles, copy, scripts', 1),
    (1, 'Social Media Management', 'Managing accounts, creating content, engagement', 2),
    (1, 'Graphic Design', 'Visual content, infographics, branding', 3),
    (1, 'Video Production', 'Filming, editing, motion graphics', 4),
    (1, 'Public Speaking', 'Presentations, panels, interviews', 5),
    (1, 'Media Relations', 'Press releases, journalist outreach, interviews', 6),
    (1, 'Photography', 'Event photography, visual documentation', 7),
    (1, 'Audio/Podcast Production', 'Recording, editing, publishing audio content', 8);

-- Organizing (category_id = 2)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (2, 'Event Planning', 'Logistics, venues, scheduling', 1),
    (2, 'Protest Organizing', 'Permits, safety, mobilization, materials', 2),
    (2, 'Community Building', 'Growing and nurturing volunteer communities', 3),
    (2, 'Volunteer Coordination', 'Recruiting, onboarding, managing volunteers', 4),
    (2, 'Workshop Facilitation', 'Leading interactive sessions and trainings', 5),
    (2, 'Grassroots Outreach', 'Door-to-door, tabling, local engagement', 6),
    (2, 'Coalition Building', 'Partnering with other organizations', 7);

-- Advocacy & Policy (category_id = 3)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (3, 'Political Lobbying', 'Meeting with MPs, government officials', 1),
    (3, 'Policy Research', 'Analyzing legislation, writing briefs', 2),
    (3, 'Letter Writing Campaigns', 'Organizing constituent communications', 3),
    (3, 'Government Relations', 'Understanding political processes, contacts', 4),
    (3, 'Petition Campaigns', 'Creating and promoting petitions', 5),
    (3, 'Public Affairs', 'Stakeholder engagement, reputation management', 6);

-- Legal (category_id = 4)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (4, 'Legal Research', 'Investigating legal precedents and frameworks', 1),
    (4, 'Compliance', 'Ensuring regulatory adherence', 2),
    (4, 'Contracts & Agreements', 'Drafting and reviewing legal documents', 3),
    (4, 'GDPR/Data Protection', 'Privacy law expertise', 4),
    (4, 'Nonprofit Law', 'Charity regulations, governance requirements', 5),
    (4, 'Intellectual Property', 'Copyright, licensing, trademarks', 6);

-- Governance (category_id = 5)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (5, 'Strategic Planning', 'Long-term vision and roadmap development', 1),
    (5, 'Board Experience', 'Serving on nonprofit boards', 2),
    (5, 'Nonprofit Governance', 'Organizational structure and accountability', 3),
    (5, 'Process Design', 'Creating effective workflows and systems', 4),
    (5, 'Risk Management', 'Identifying and mitigating organizational risks', 5),
    (5, 'Financial Oversight', 'Budget review, financial governance', 6);

-- Technical (category_id = 6)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (6, 'Web Development', 'Frontend, backend, full-stack', 1),
    (6, 'Software Engineering', 'Programming, system design', 2),
    (6, 'Data Analysis', 'Statistics, visualization, insights', 3),
    (6, 'UX/UI Design', 'User experience and interface design', 4),
    (6, 'DevOps', 'Infrastructure, deployment, automation', 5),
    (6, 'AI/ML', 'Machine learning, AI systems', 6),
    (6, 'Cybersecurity', 'Security practices and privacy tech', 7),
    (6, 'No-Code Tools', 'Notion, Airtable, Zapier, etc.', 8);

-- Research (category_id = 7)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (7, 'AI Safety Research', 'Technical AI alignment and safety', 1),
    (7, 'AI Governance Research', 'Policy and regulatory frameworks for AI', 2),
    (7, 'Fact-Checking', 'Verifying claims and sources', 3),
    (7, 'Content Research', 'Background research for articles and campaigns', 4),
    (7, 'Academic Writing', 'Papers, literature reviews, citations', 5),
    (7, 'Investigative Research', 'Deep dives, FOIA requests, etc.', 6),
    (7, 'Survey Design', 'Creating and analyzing surveys', 7);

-- Operations (category_id = 8)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
    (8, 'Project Management', 'Planning, tracking, delivery', 1),
    (8, 'Admin & Logistics', 'Scheduling, documentation, coordination', 2),
    (8, 'Fundraising', 'Grant writing, donor relations, campaigns', 3),
    (8, 'Translation', 'Multilingual content adaptation', 4),
    (8, 'Bookkeeping', 'Financial tracking and reporting', 5),
    (8, 'HR/People Ops', 'Volunteer support, onboarding, culture', 6),
    (8, 'CRM Management', 'Managing contact databases and outreach', 7);
