import { useMemo } from 'react';

interface EmailPreviewProps {
  body: string;
  summary?: string;
  maxLength?: number;
}

export function EmailPreview({ body, summary, maxLength = 500 }: EmailPreviewProps) {
  const formattedBody = useMemo(() => {
    if (!body) return summary || 'No preview available';

    // Clean up the email body for better readability
    let cleaned = body;

    // Replace multiple newlines with double newlines for paragraph breaks
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Handle common email quote patterns - collapse them
    const quotePatterns = [
      /On .+ wrote:\s*\n/gi,
      /From:.+\n/gi,
      /Sent:.+\n/gi,
      /To:.+\n/gi,
      /Subject:.+\n/gi,
      /^>+ ?.*/gm,
    ];

    // Find where quoted content starts
    const quoteStart = cleaned.search(/On .+ wrote:/i);
    
    if (quoteStart > 0 && quoteStart < cleaned.length - 50) {
      // There's quoted content - truncate before it
      cleaned = cleaned.substring(0, quoteStart).trim();
      if (cleaned.length > 0) {
        cleaned += '\n\n[Previous messages hidden]';
      }
    }

    // Truncate if too long
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim() + '...';
    }

    return cleaned;
  }, [body, summary, maxLength]);

  return (
    <div className="bg-muted/50 rounded-lg p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
        {formattedBody}
      </p>
    </div>
  );
}
