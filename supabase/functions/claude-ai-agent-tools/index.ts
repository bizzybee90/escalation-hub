import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Knowledge base tools for gathering information
const KNOWLEDGE_TOOLS = [
  {
    name: "search_faqs",
    description: "Search the FAQ database for answers to common questions. Returns relevant FAQs based on keywords or category.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query or keywords to find relevant FAQs"
        },
        category: {
          type: "string",
          description: "Optional category to filter FAQs (e.g., 'pricing', 'scheduling', 'services')"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_customer_info",
    description: "Retrieve detailed information about a customer including their history, preferences, and notes.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The UUID of the customer"
        }
      },
      required: ["customer_id"]
    }
  },
  {
    name: "get_pricing",
    description: "Get pricing information for services. Can search by service name or get all pricing.",
    input_schema: {
      type: "object",
      properties: {
        service_name: {
          type: "string",
          description: "Optional service name to filter pricing (e.g., 'window cleaning', 'conservatory', 'gutters')"
        }
      },
      required: []
    }
  },
  {
    name: "get_business_facts",
    description: "Retrieve business-specific facts and information like operating hours, service areas, policies, etc.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category to filter facts (e.g., 'hours', 'areas', 'policies')"
        }
      },
      required: []
    }
  },
  {
    name: "search_similar_conversations",
    description: "Search past conversations using semantic similarity to learn from successful interactions and human corrections.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The text to find similar past conversations for"
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 5)"
        }
      },
      required: ["query"]
    }
  }
];

// CRITICAL: The response tool that Claude MUST call to provide output
const RESPONSE_TOOL = {
  name: "respond_to_customer",
  description: "YOU MUST call this tool to provide your final response to the customer. This is REQUIRED for every message.",
  input_schema: {
    type: "object",
    properties: {
      response: {
        type: "string",
        description: "Your message to the customer (20-500 characters). Must be a complete, friendly response."
      },
      confidence: {
        type: "number",
        description: "Confidence score from 0.0 to 1.0. Below 0.5 means escalate."
      },
      intent: {
        type: "string",
        description: "Customer intent category (e.g., pricing_query, schedule_change, complaint, general_inquiry)"
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "upset", "angry"],
        description: "Customer sentiment"
      },
      escalate: {
        type: "boolean",
        description: "Set to true if this needs human review (complaints, refunds, legal, angry customers)"
      },
      escalation_reason: {
        type: "string",
        description: "If escalating, explain why (required if escalate is true)"
      },
      ai_title: {
        type: "string",
        description: "Short title for this conversation (max 50 chars)"
      },
      ai_summary: {
        type: "string",
        description: "Brief summary of what the customer needs (max 200 chars)"
      },
      ai_category: {
        type: "string",
        description: "Category: general, pricing, complaint, booking, schedule, refund, feedback, other"
      }
    },
    required: ["response", "confidence", "intent", "sentiment", "escalate", "ai_title", "ai_summary", "ai_category"]
  }
};

const ALL_TOOLS = [...KNOWLEDGE_TOOLS, RESPONSE_TOOL];

const SYSTEM_PROMPT = `You are a friendly, professional customer service AI for MAC Cleaning, a window cleaning service in the Luton and Milton Keynes area.

## CRITICAL INSTRUCTION
You MUST call the "respond_to_customer" tool to provide your response. Do NOT write JSON text - use the tool.

## Your Personality & Brand Voice
- Warm and helpful, like a friendly neighbour who genuinely cares
- Professional but not corporate - real and human
- British English (favour, colour, apologise)
- Concise - customers are busy (2-4 sentences max)
- Proactive in offering solutions
- Take ownership of problems - never deflect

## Available Tools
Use these tools to get accurate information BEFORE responding:
- search_faqs: Find answers in the FAQ database
- get_customer_info: Look up customer details and history
- get_pricing: Get current pricing - ALWAYS use for price questions
- get_business_facts: Look up business information (hours, areas, policies)
- search_similar_conversations: Learn from past successful interactions

IMPORTANT: After gathering information, you MUST call "respond_to_customer" to send your response.

## Complaint & Issue Handling
When a customer is upset or has a complaint:
1. Lead with empathy - acknowledge frustration FIRST
2. Take ownership - say "I'm sorry this happened"
3. Don't make excuses
4. Provide clear next steps with timeline

## When to Escalate (set escalate: true)
- Customer mentions legal action, solicitors, or trading standards
- Customer is very angry or uses strong language
- Customer requests refund over £50
- Customer has photographic/video evidence of poor service
- Payment disputes or billing errors
- Property damage claims
- Personal circumstances (illness, bereavement)
- You genuinely don't know the answer after using tools
- Confidence is below 0.5

## Response Guidelines
- Keep responses 20-500 characters
- Never include placeholder text like [name] or {{variable}}
- Don't ask customer to call unless escalating
- Always personalise if you have customer's name
- End with clear next step or offer of help

## Confidence Scoring
- 0.9-1.0: Simple query, clear answer, customer happy
- 0.7-0.9: Straightforward but may need follow-up
- 0.5-0.7: Somewhat complex, less certain
- Below 0.5: MUST escalate to human`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { message, conversation_history, customer_data } = await req.json();

    console.log('📥 [AI-Agent] Processing message:', message.message_content);
    console.log('📥 [AI-Agent] Customer:', customer_data?.name || 'Unknown');
    console.log('📥 [AI-Agent] Channel:', message.channel);

    // Prepare conversation context
    type Message = 
      | { role: 'user'; content: string | any[] }
      | { role: 'assistant'; content: any[] };

    const messages: Message[] = [
      {
        role: 'user',
        content: `Customer: ${customer_data?.name || 'Unknown'}
Channel: ${message.channel}
Message: "${message.message_content}"

Recent conversation history:
${conversation_history.slice(0, 5).map((m: any) => `${m.actor_type}: ${m.body}`).join('\n')}

IMPORTANT: Use tools to gather information, then call "respond_to_customer" with your final response.`
      }
    ];

    let finalResponse = null;
    const maxIterations = 8; // Allow more iterations for tool use
    let iteration = 0;

    // Tool calling loop - continue until respond_to_customer is called
    while (iteration < maxIterations && !finalResponse) {
      iteration++;
      
      const claudeBody: any = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
        tools: ALL_TOOLS,
      };

      console.log(`🔄 [AI-Agent] Iteration ${iteration}`);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(claudeBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [AI-Agent] Claude API error:', errorText);
        throw new Error(`Claude API failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('🤖 [AI-Agent] Claude response:', JSON.stringify(data, null, 2));

      // Check for tool use
      const toolUseBlocks = data.content.filter((block: any) => block.type === 'tool_use');
      
      if (toolUseBlocks.length === 0) {
        // No tools called - this shouldn't happen but handle it
        console.warn('⚠️ [AI-Agent] No tool called - forcing escalation');
        finalResponse = {
          response: "Thank you for your message. A team member will review this and get back to you shortly.",
          confidence: 0,
          intent: "unknown",
          sentiment: "neutral",
          escalate: true,
          escalation_reason: "AI did not use response tool",
          ai_title: "Needs Review",
          ai_summary: message.message_content.substring(0, 100),
          ai_category: "other"
        };
        break;
      }

      // Process tool calls
      const toolResultsForThisIteration: any[] = [];
      
      for (const toolUse of toolUseBlocks) {
        const { name, input, id } = toolUse;
        console.log(`🔧 [AI-Agent] Tool called: ${name}`, JSON.stringify(input));

        // Check if this is the response tool
        if (name === 'respond_to_customer') {
          console.log('✅ [AI-Agent] Response tool called with:', JSON.stringify(input, null, 2));
          finalResponse = input;
          break;
        }

        // Execute knowledge tools
        let toolResult: any;

        try {
          switch (name) {
            case 'search_faqs':
              toolResult = await searchFaqs(supabase, input);
              break;
            case 'get_customer_info':
              toolResult = await getCustomerInfo(supabase, input, customer_data);
              break;
            case 'get_pricing':
              toolResult = await getPricing(supabase, input);
              break;
            case 'get_business_facts':
              toolResult = await getBusinessFacts(supabase, input);
              break;
            case 'search_similar_conversations':
              toolResult = await searchSimilarConversations(supabase, input);
              break;
            default:
              toolResult = { error: `Unknown tool: ${name}` };
          }
        } catch (error) {
          console.error(`❌ [AI-Agent] Tool ${name} error:`, error);
          toolResult = { error: error instanceof Error ? error.message : 'Tool execution failed' };
        }

        console.log(`📋 [AI-Agent] Tool ${name} result:`, JSON.stringify(toolResult).substring(0, 200));

        toolResultsForThisIteration.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(toolResult)
        });
      }

      // If we got the final response, exit loop
      if (finalResponse) break;

      // Add assistant message with tool use
      messages.push({
        role: 'assistant',
        content: data.content
      });

      // Add tool results
      messages.push({
        role: 'user',
        content: toolResultsForThisIteration
      });
    }

    // If loop ended without response, escalate
    if (!finalResponse) {
      console.warn('⚠️ [AI-Agent] Max iterations reached without response tool call');
      finalResponse = {
        response: "Thank you for your message. A team member will review this and get back to you shortly.",
        confidence: 0,
        intent: "unknown",
        sentiment: "neutral",
        escalate: true,
        escalation_reason: "AI did not provide response after max iterations",
        ai_title: "Needs Review",
        ai_summary: message.message_content.substring(0, 100),
        ai_category: "other"
      };
    }

    console.log('📤 [AI-Agent] Final output:', JSON.stringify(finalResponse, null, 2));

    return new Response(JSON.stringify(finalResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [AI-Agent] Fatal error:', error);
    
    const fallbackResponse = {
      response: "Thank you for your message. A team member will review this and get back to you shortly.",
      confidence: 0,
      intent: "unknown",
      sentiment: "neutral",
      escalate: true,
      escalation_reason: error instanceof Error ? `AI agent error: ${error.message}` : 'AI agent error',
      ai_title: "AI Error - Needs Review",
      ai_summary: "AI agent encountered an error processing this message",
      ai_category: "error"
    };

    return new Response(JSON.stringify(fallbackResponse), {
      status: 200, // Return 200 so receive-message can handle it
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Tool implementation functions
async function searchFaqs(supabase: any, input: any) {
  const { query, category } = input;
  
  let queryBuilder = supabase
    .from('faq_database')
    .select('question, answer, category')
    .or(`question.ilike.%${query}%,answer.ilike.%${query}%,keywords.cs.{${query}}`);
  
  if (category) {
    queryBuilder = queryBuilder.eq('category', category);
  }

  const { data, error } = await queryBuilder.limit(5);

  if (error) throw error;
  
  return data || [];
}

async function getCustomerInfo(supabase: any, input: any, existingCustomerData: any) {
  if (existingCustomerData) {
    return existingCustomerData;
  }

  const { customer_id } = input;
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customer_id)
    .single();

  if (error) throw error;
  
  return data;
}

async function getPricing(supabase: any, input: any) {
  const { service_name } = input;
  
  let queryBuilder = supabase
    .from('price_list')
    .select('*');
  
  if (service_name) {
    queryBuilder = queryBuilder.ilike('service_name', `%${service_name}%`);
  }

  const { data, error } = await queryBuilder.order('service_name');

  if (error) throw error;
  
  return data || [];
}

async function getBusinessFacts(supabase: any, input: any) {
  const { category } = input;
  
  let queryBuilder = supabase
    .from('business_facts')
    .select('*');
  
  if (category) {
    queryBuilder = queryBuilder.eq('category', category);
  }

  const { data, error } = await queryBuilder;

  if (error) throw error;
  
  return data || [];
}

async function searchSimilarConversations(supabase: any, input: any) {
  const { query, limit = 5 } = input;
  
  try {
    const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-embedding', {
      body: { text: query }
    });

    if (embeddingError || !embeddingData?.embedding) {
      console.error('Failed to generate embedding:', embeddingError);
      return [];
    }

    const { data, error } = await supabase.rpc('match_conversations', {
      query_embedding: embeddingData.embedding,
      match_threshold: 0.7,
      match_count: limit
    });

    if (error) {
      console.error('Vector search error:', error);
      return [];
    }

    return (data || []).map((conv: any) => ({
      text: conv.text,
      ai_response: conv.ai_response,
      final_response: conv.final_response,
      human_edited: conv.human_edited,
      led_to_booking: conv.led_to_booking,
    }));
  } catch (error) {
    console.error('Similar conversations search failed:', error);
    return [];
  }
}
