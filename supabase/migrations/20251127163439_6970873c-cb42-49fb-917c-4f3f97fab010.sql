-- Seed FAQ data for AI agent
INSERT INTO faqs (question, answer, category, keywords) VALUES
('When is my next clean?', 'Your next scheduled clean is shown in your booking confirmation. If you need to check, reply with your postcode and I can look it up for you.', 'scheduling', ARRAY['schedule', 'next clean', 'when', 'appointment']),
('How do I reschedule?', 'Just let us know your preferred new date and we will do our best to accommodate. We ask for at least 24 hours notice if possible.', 'scheduling', ARRAY['reschedule', 'change', 'move', 'different time']),
('What if it rains?', 'We clean in light rain as the pure water system works well in wet conditions. We only postpone in heavy rain or storms for safety reasons.', 'service', ARRAY['rain', 'weather', 'wet', 'postpone']),
('How do I pay?', 'We accept cash on the day, bank transfer, or card payment. Most customers pay on the day of their clean.', 'payment', ARRAY['payment', 'pay', 'card', 'cash', 'transfer']),
('Can you clean inside windows?', 'Yes! Inside cleans are available at an additional 50% of the external price. Just let us know and we can add it to your service.', 'service', ARRAY['inside', 'internal', 'interior windows']),
('Do you clean in winter?', 'Yes, we operate year-round. Windows still get dirty in winter and we maintain our regular schedule throughout the year.', 'service', ARRAY['winter', 'cold', 'year-round']),
('What areas do you cover?', 'We cover Luton, Dunstable, Houghton Regis, Leighton Buzzard, and Milton Keynes areas. Reply with your postcode to confirm coverage.', 'general', ARRAY['area', 'location', 'postcode', 'cover', 'service area']),
('How often should I have my windows cleaned?', 'We recommend every 4-6 weeks for most homes. We offer flexible schedules of 4, 6, or 8 week intervals depending on your needs.', 'service', ARRAY['frequency', 'often', 'regular', 'schedule']),
('What is pure water cleaning?', 'We use purified water fed through poles to clean your windows. It leaves no residue and dries naturally to a streak-free finish.', 'service', ARRAY['pure water', 'system', 'method', 'how', 'process'])
ON CONFLICT DO NOTHING;