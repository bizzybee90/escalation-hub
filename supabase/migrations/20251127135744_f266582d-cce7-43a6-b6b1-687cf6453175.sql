-- Create FAQs table
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view workspace FAQs"
  ON public.faqs FOR SELECT
  USING (workspace_id = get_my_workspace_id());

CREATE POLICY "Admins can manage FAQs"
  ON public.faqs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster searches
CREATE INDEX idx_faqs_workspace_id ON public.faqs(workspace_id);
CREATE INDEX idx_faqs_category ON public.faqs(category);
CREATE INDEX idx_faqs_keywords ON public.faqs USING GIN(keywords);

-- Add updated_at trigger
CREATE TRIGGER update_faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data for MAC Cleaning (first workspace)
INSERT INTO public.faqs (workspace_id, category, question, answer, keywords, priority)
SELECT 
  id as workspace_id,
  category,
  question,
  answer,
  keywords,
  priority
FROM public.workspaces
CROSS JOIN (
  VALUES
    -- Services
    ('services', 'What cleaning services do you offer?', 'We offer residential cleaning, deep cleaning, end of tenancy cleaning, office cleaning, and carpet cleaning. All services include eco-friendly products and fully trained staff.', ARRAY['services', 'cleaning', 'residential', 'office', 'carpet', 'deep clean'], 10),
    ('services', 'Do you provide cleaning supplies?', 'Yes! We bring all necessary cleaning supplies and equipment. We use eco-friendly, non-toxic products that are safe for children and pets.', ARRAY['supplies', 'products', 'eco-friendly', 'equipment'], 8),
    ('services', 'Can you clean my carpets?', 'Absolutely! We offer professional carpet cleaning using hot water extraction. This deep cleans and sanitizes carpets, removing dirt, stains, and allergens.', ARRAY['carpet', 'stains', 'deep clean', 'sanitize'], 7),
    
    -- Pricing
    ('pricing', 'How much do you charge?', 'Pricing depends on property size and service type. Basic residential cleaning starts from £15/hour. Deep cleans are £25/hour. End of tenancy is quoted per property. Call us for a free quote!', ARRAY['price', 'cost', 'quote', 'hourly rate', 'charge'], 10),
    ('pricing', 'Do you offer discounts?', 'Yes! We offer 10% off for regular weekly bookings and 15% off for first-time customers. We also have referral discounts - get £20 off when you refer a friend!', ARRAY['discount', 'offer', 'promotion', 'referral', 'weekly'], 8),
    ('pricing', 'What payment methods do you accept?', 'We accept cash, bank transfer, and all major cards. Payment is due upon completion of service. We also offer invoicing for business clients.', ARRAY['payment', 'cash', 'card', 'bank transfer', 'invoice'], 6),
    
    -- Booking & Availability
    ('booking', 'How do I book a cleaning?', 'You can book by replying here, calling us at 01234 567890, or visiting our website. We typically need 24 hours notice but can accommodate same-day requests when available.', ARRAY['book', 'appointment', 'schedule', 'reserve'], 10),
    ('booking', 'What are your operating hours?', 'We operate Monday to Saturday, 8am-6pm. We are closed on Sundays and bank holidays. Emergency cleans can be arranged outside these hours for an additional fee.', ARRAY['hours', 'times', 'open', 'available', 'closed'], 9),
    ('booking', 'How far in advance should I book?', 'We recommend booking at least 24-48 hours in advance, especially for weekends. However, we can often accommodate same-day or next-day bookings depending on availability.', ARRAY['advance', 'notice', 'booking', 'schedule'], 7),
    ('booking', 'Can I reschedule my appointment?', 'Yes! Please give us at least 24 hours notice to reschedule without charge. Cancellations with less than 24 hours notice may incur a £25 cancellation fee.', ARRAY['reschedule', 'cancel', 'change', 'postpone'], 8),
    
    -- Coverage Area
    ('coverage', 'What areas do you cover?', 'We serve Luton, Milton Keynes, Bedford, and surrounding areas within a 20-mile radius. Contact us to confirm if we cover your specific location!', ARRAY['location', 'area', 'coverage', 'luton', 'milton keynes', 'bedford'], 9),
    ('coverage', 'Do you travel to my area?', 'We cover Luton, Milton Keynes, Bedford and within 20 miles of these areas. Let me know your postcode and I can confirm if we service your location.', ARRAY['travel', 'distance', 'postcode', 'location'], 7),
    
    -- Company Info
    ('company', 'How long have you been in business?', 'MAC Cleaning has been serving happy customers since 2015. We have 840+ satisfied regular customers and maintain a 4.9/5 star rating.', ARRAY['experience', 'history', 'established', 'years'], 6),
    ('company', 'Are you insured?', 'Yes, we are fully insured with public liability insurance up to £5 million. All our cleaners are vetted, trained, and insured.', ARRAY['insurance', 'liability', 'covered', 'protected'], 8),
    ('company', 'Do you guarantee your work?', 'Absolutely! We offer a 100% satisfaction guarantee. If you are not happy with any aspect of the clean, we will return within 24 hours to rectify it at no extra cost.', ARRAY['guarantee', 'satisfaction', 'quality', 'promise'], 7)
) AS faq_data(category, question, answer, keywords, priority)
LIMIT 1;