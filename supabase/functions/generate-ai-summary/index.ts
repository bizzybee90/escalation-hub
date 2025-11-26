import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { period = 'daily' } = await req.json();
    console.log('📊 Generating AI summary for period:', period);

    // Calculate time range
    const now = new Date();
    const startTime = new Date(now);
    if (period === 'hourly') {
      startTime.setHours(startTime.getHours() - 1);
    } else {
      startTime.setHours(0, 0, 0, 0);
    }

    // Get workspace_id
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .single();

    if (!workspace) throw new Error('Workspace not found');

    // Fetch AI-handled conversations in time range
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('is_escalated', false)
      .gte('created_at', startTime.toISOString())
      .lte('created_at', now.toISOString());

    if (error) throw error;

    const totalConversations = conversations?.length || 0;
    const resolvedConversations = conversations?.filter(c => c.status === 'resolved').length || 0;
    const resolutionRate = totalConversations > 0 
      ? Math.round((resolvedConversations / totalConversations) * 100) 
      : 0;

    // Count by category
    const categoryBreakdown: Record<string, number> = {};
    conversations?.forEach(c => {
      const category = c.category || 'other';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    });

    // Find low confidence conversations (potential escalation risks)
    const lowConfidence = conversations?.filter(c => 
      c.ai_confidence && c.ai_confidence < 0.7
    ) || [];

    // Calculate average AI confidence
    const avgConfidence = conversations && conversations.length > 0
      ? conversations.reduce((sum, c) => sum + (c.ai_confidence || 0), 0) / conversations.length
      : 0;

    // Sentiment analysis
    const sentimentBreakdown: Record<string, number> = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
    conversations?.forEach(c => {
      if (c.ai_sentiment) {
        sentimentBreakdown[c.ai_sentiment] = (sentimentBreakdown[c.ai_sentiment] || 0) + 1;
      }
    });

    const summary = {
      period,
      start_time: startTime.toISOString(),
      end_time: now.toISOString(),
      metrics: {
        total_conversations: totalConversations,
        resolved_conversations: resolvedConversations,
        resolution_rate: resolutionRate,
        average_confidence: Math.round(avgConfidence * 100) / 100,
        low_confidence_count: lowConfidence.length
      },
      breakdowns: {
        by_category: categoryBreakdown,
        by_sentiment: sentimentBreakdown
      },
      alerts: {
        low_confidence_conversations: lowConfidence.map(c => ({
          id: c.id,
          confidence: c.ai_confidence,
          category: c.category,
          created_at: c.created_at
        }))
      },
      insights: [
        resolutionRate >= 80 
          ? `✅ Excellent AI resolution rate of ${resolutionRate}%`
          : resolutionRate >= 60
            ? `⚠️ AI resolution rate at ${resolutionRate}% - room for improvement`
            : `🚨 Low AI resolution rate at ${resolutionRate}% - needs attention`,
        lowConfidence.length > 0 
          ? `⚠️ ${lowConfidence.length} conversation(s) with low AI confidence may need review`
          : '✅ All conversations handled with high confidence',
        avgConfidence >= 0.8
          ? `✅ Strong average AI confidence: ${(avgConfidence * 100).toFixed(0)}%`
          : `⚠️ Average AI confidence needs improvement: ${(avgConfidence * 100).toFixed(0)}%`
      ]
    };

    console.log('✅ Summary generated:', summary);

    return new Response(
      JSON.stringify({ 
        success: true,
        summary
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error generating AI summary:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});