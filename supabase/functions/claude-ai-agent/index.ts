import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentRequest {
  channel: 'sms' | 'whatsapp' | 'email' | 'webchat';
  customerIdentifier: string;
  customerName?: string;
  messageContent: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  metadata?: Record<string, any>;
}

interface AgentResponse {
  intent: 'faq' | 'booking' | 'quote' | 'complaint' | 'other';
  responseText: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  category: string;
  suggestedActions?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!anthropicApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const agentRequest: AgentRequest = await req.json();

    console.log('Processing message:', {
      channel: agentRequest.channel,
      customer: agentRequest.customerIdentifier,
      messagePreview: agentRequest.messageContent.substring(0, 50)
    });

    // Fetch FAQs from database
    const { data: faqs, error: faqError } = await supabase
      .from('faqs')
      .select('category, question, answer, keywords')
      .order('priority', { ascending: false });

    if (faqError) {
      console.error('Error fetching FAQs:', faqError);
    }

    // Build context for Claude
    const faqContext = faqs ? faqs.map(faq => 
      `Category: ${faq.category}\nQ: ${faq.question}\nA: ${faq.answer}\nKeywords: ${faq.keywords.join(', ')}`
    ).join('\n\n') : '';

    // Channel-specific formatting rules
    const channelRules = {
      sms: 'Keep responses under 160 characters. Use minimal formatting. Be direct.',
      whatsapp: 'Use emojis sparingly. Keep messages concise but friendly. Max 300 characters.',
      email: 'Professional tone. Can use longer responses. Include greetings and signatures.',
      webchat: 'Conversational. Use formatting like bullet points. Quick responses preferred.'
    };

    const systemPrompt = `You are a valued team member at MAC Cleaning, representing a trusted local business serving 840 happy customers across Luton, Milton Keynes, and surrounding areas.

CHANNEL: ${agentRequest.channel}
CHANNEL RULES: ${channelRules[agentRequest.channel]}

COMPANY KNOWLEDGE BASE:
${faqContext}

YOUR CORE CAPABILITIES:
1. Answer FAQs using the knowledge base above
2. Book cleaning appointments (you can provide availability and take booking requests)
3. Provide quotes for cleaning services based on property type and size
4. Handle complaints with empathy and escalate when needed
5. General customer service

DECISION FRAMEWORK:

HIGH CONFIDENCE (80-100%):
- Direct FAQ match with clear answer
- Simple booking inquiry you can handle
- Straightforward pricing question
→ RESPOND DIRECTLY

MEDIUM CONFIDENCE (50-79%):
- Ambiguous request needing clarification
- Complex booking with specific requirements
- Quote request needing property details
→ ASK CLARIFYING QUESTIONS

LOW CONFIDENCE (<50%) OR ESCALATION TRIGGERS:
- Complaint about service quality
- Refund/cancellation requests
- Technical issues or emergencies
- Customer is frustrated/angry
- Request outside standard services
- You're unsure of the answer
→ ESCALATE TO HUMAN

SENTIMENT DETECTION:
- Positive: Happy, satisfied, complimentary language
- Neutral: Factual, information-seeking
- Negative: Frustrated, disappointed, complaint indicators (words like "unhappy", "disappointed", "terrible", "again", "still not")

OUTPUT FORMAT (JSON ONLY):
{
  "intent": "faq" | "booking" | "quote" | "complaint" | "other",
  "responseText": "Your helpful response here (following channel rules)",
  "shouldEscalate": true | false,
  "escalationReason": "Why this needs human attention (if shouldEscalate=true)",
  "confidence": 0-100,
  "sentiment": "positive" | "neutral" | "negative",
  "category": "services" | "pricing" | "booking" | "coverage" | "company" | "complaint" | "other",
  "suggestedActions": ["action1", "action2"] // Optional: e.g., ["send_booking_link", "check_availability"]
}

IMPORTANT:
- Return ONLY valid JSON, no other text
- Never say "I don't know" - if unsure, escalate with shouldEscalate=true
- For complaints or negative sentiment, always escalate
- Match tone to channel (SMS=brief, Email=detailed)`;

    // Build message history
    const messages = [
      { role: 'user', content: agentRequest.messageContent }
    ];

    // Add conversation history if provided
    if (agentRequest.conversationHistory && agentRequest.conversationHistory.length > 0) {
      // Include last 5 messages for context
      const recentHistory = agentRequest.conversationHistory.slice(-5);
      messages.unshift(...recentHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })));
    }

    console.log('Calling Claude API...');
    const startTime = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;
    console.log(`Claude response received in ${latency}ms`);

    const responseText = data.content[0].text;
    
    // Parse the JSON response from Claude
    let agentResponse: AgentResponse;
    try {
      // Extract JSON from response (Claude might wrap it in markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      agentResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      // Fallback response if parsing fails
      agentResponse = {
        intent: 'other',
        responseText: "I'm here to help! Could you please rephrase your question? If this is urgent, I'll connect you with a team member.",
        shouldEscalate: true,
        escalationReason: 'Failed to parse AI response',
        confidence: 0,
        sentiment: 'neutral',
        category: 'other'
      };
    }

    console.log('Agent decision:', {
      intent: agentResponse.intent,
      confidence: agentResponse.confidence,
      shouldEscalate: agentResponse.shouldEscalate,
      sentiment: agentResponse.sentiment
    });

    return new Response(
      JSON.stringify({
        ...agentResponse,
        metadata: {
          model: 'claude-sonnet-4-20250514',
          latency,
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in claude-ai-agent:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        // Fail-safe: always escalate on error
        shouldEscalate: true,
        escalationReason: 'System error occurred',
        responseText: 'I apologize, but I need to connect you with a team member who can assist you better.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
