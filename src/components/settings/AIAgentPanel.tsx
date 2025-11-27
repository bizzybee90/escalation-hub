import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Bot, Settings as SettingsIcon, Save, Plus, Trash2, Edit2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from 'zod';

interface AIModel {
  id: string;
  name: string;
  provider: 'lovable' | 'anthropic' | 'openai' | 'google';
  type: 'text' | 'image' | 'multimodal';
  status: 'active' | 'available' | 'inactive';
  description: string;
}

const lovableModels: AIModel[] = [
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'lovable',
    type: 'multimodal',
    status: 'active',
    description: 'Top-tier Gemini model for complex reasoning and multimodal tasks'
  },
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    provider: 'lovable',
    type: 'multimodal',
    status: 'active',
    description: 'Next-generation Gemini model with enhanced capabilities'
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'lovable',
    type: 'multimodal',
    status: 'active',
    description: 'Balanced performance and cost for most use cases'
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'lovable',
    type: 'text',
    status: 'active',
    description: 'Fast and cost-effective for simple tasks'
  },
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    provider: 'lovable',
    type: 'image',
    status: 'active',
    description: 'Image generation model'
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    provider: 'lovable',
    type: 'image',
    status: 'active',
    description: 'Next-gen image generation'
  },
  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    provider: 'lovable',
    type: 'multimodal',
    status: 'active',
    description: 'Most capable OpenAI model with superior reasoning'
  },
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'lovable',
    type: 'text',
    status: 'active',
    description: 'Balanced OpenAI model for most tasks'
  },
  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'lovable',
    type: 'text',
    status: 'active',
    description: 'Fast and efficient for high-volume tasks'
  }
];

const claudeModels: AIModel[] = [
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    type: 'multimodal',
    status: 'active',
    description: 'Most capable Claude model with superior reasoning'
  },
  {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    type: 'multimodal',
    status: 'active',
    description: 'Highly intelligent and capable model'
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    type: 'multimodal',
    status: 'available',
    description: 'High-performance with exceptional reasoning'
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    type: 'text',
    status: 'available',
    description: 'Fastest Claude model for quick responses'
  }
];

interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  model: string;
  isDefault: boolean;
}

const promptSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  prompt: z.string().trim().min(10, 'Prompt must be at least 10 characters'),
  model: z.string().min(1, 'Model is required')
});

export const AIAgentPanel = () => {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [isSaving, setIsSaving] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);

  useEffect(() => {
    const checkAnthropicKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('claude-ai-agent', {
          body: { test: true }
        });
        setHasAnthropicKey(!error || error.message !== 'ANTHROPIC_API_KEY is not set');
      } catch {
        setHasAnthropicKey(false);
      }
    };

    checkAnthropicKey();
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    // Load from localStorage for now
    const saved = localStorage.getItem('ai-prompts');
    if (saved) {
      setPrompts(JSON.parse(saved));
    } else {
      // Set default prompt
      const defaultPrompts: SystemPrompt[] = [{
        id: '1',
        name: 'Default Customer Support',
        prompt: 'You are a helpful AI assistant for customer support. Be concise, professional, and friendly.',
        model: 'google/gemini-2.5-flash',
        isDefault: true
      }];
      setPrompts(defaultPrompts);
      localStorage.setItem('ai-prompts', JSON.stringify(defaultPrompts));
    }
  };

  const handleSavePrompt = async () => {
    try {
      // Validate input
      const validation = promptSchema.safeParse({
        name: promptName,
        prompt: promptText,
        model: selectedModel
      });

      if (!validation.success) {
        toast({
          title: 'Validation Error',
          description: validation.error.issues[0].message,
          variant: 'destructive'
        });
        return;
      }

      setIsSaving(true);

      if (editingPrompt) {
        // Update existing prompt
        const updated = prompts.map(p => 
          p.id === editingPrompt.id 
            ? { ...p, name: promptName, prompt: promptText, model: selectedModel }
            : p
        );
        setPrompts(updated);
        localStorage.setItem('ai-prompts', JSON.stringify(updated));
        setEditingPrompt(null);
      } else {
        // Add new prompt
        const newPrompt: SystemPrompt = {
          id: Date.now().toString(),
          name: promptName,
          prompt: promptText,
          model: selectedModel,
          isDefault: prompts.length === 0
        };
        const updated = [...prompts, newPrompt];
        setPrompts(updated);
        localStorage.setItem('ai-prompts', JSON.stringify(updated));
      }

      setPromptName('');
      setPromptText('');
      setSelectedModel('google/gemini-2.5-flash');
      
      toast({
        title: editingPrompt ? 'Prompt Updated' : 'Prompt Created',
        description: 'Your AI agent configuration has been saved.'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save prompt',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPrompt = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt);
    setPromptName(prompt.name);
    setPromptText(prompt.prompt);
    setSelectedModel(prompt.model);
  };

  const handleDeletePrompt = (id: string) => {
    const updated = prompts.filter(p => p.id !== id);
    setPrompts(updated);
    localStorage.setItem('ai-prompts', JSON.stringify(updated));
    toast({
      title: 'Prompt Deleted',
      description: 'The prompt has been removed.'
    });
  };

  const handleSetDefault = (id: string) => {
    const updated = prompts.map(p => ({
      ...p,
      isDefault: p.id === id
    }));
    setPrompts(updated);
    localStorage.setItem('ai-prompts', JSON.stringify(updated));
    toast({
      title: 'Default Prompt Set',
      description: 'This prompt is now the default.'
    });
  };

  const getProviderBadge = (provider: AIModel['provider']) => {
    const colors = {
      lovable: 'bg-primary/10 text-primary border-primary/20',
      anthropic: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      openai: 'bg-green-500/10 text-green-600 border-green-500/20',
      google: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    };
    const labels = {
      lovable: 'Lovable AI',
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google'
    };
    return (
      <Badge variant="outline" className={colors[provider]}>
        {labels[provider]}
      </Badge>
    );
  };

  const getStatusBadge = (status: AIModel['status']) => {
    const colors = {
      active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      available: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      inactive: 'bg-muted text-muted-foreground border-muted'
    };
    return (
      <Badge variant="outline" className={colors[status]}>
        {status === 'active' ? '✓ Active' : status === 'available' ? 'Available' : 'Inactive'}
      </Badge>
    );
  };

  const getTypeBadge = (type: AIModel['type']) => {
    const icons = {
      text: '📝',
      image: '🖼️',
      multimodal: '🎨'
    };
    return (
      <Badge variant="secondary" className="text-xs">
        {icons[type]} {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>AI Agent Management</CardTitle>
          </div>
          <CardDescription>
            Manage connected AI models and configure system prompts for your agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="models" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="models">
                <Sparkles className="h-4 w-4 mr-2" />
                Connected Models
              </TabsTrigger>
              <TabsTrigger value="prompts">
                <SettingsIcon className="h-4 w-4 mr-2" />
                System Prompts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="models" className="space-y-6">
              {/* Lovable AI Models */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Lovable AI Gateway
                  </h3>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    Built-in • No API Key Required
                  </Badge>
                </div>
                <div className="grid gap-3">
                  {lovableModels.map((model) => (
                    <Card key={model.id} className="border-border/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium">{model.name}</h4>
                              {getTypeBadge(model.type)}
                              {getProviderBadge(model.provider)}
                              {getStatusBadge(model.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">{model.description}</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{model.id}</code>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Claude Models */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Bot className="h-5 w-5 text-orange-600" />
                    Anthropic Claude
                  </h3>
                  {hasAnthropicKey ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      API Key Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      API Key Required
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3">
                  {claudeModels.map((model) => (
                    <Card key={model.id} className="border-border/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium">{model.name}</h4>
                              {getTypeBadge(model.type)}
                              {getProviderBadge(model.provider)}
                              {getStatusBadge(hasAnthropicKey ? model.status : 'inactive')}
                            </div>
                            <p className="text-sm text-muted-foreground">{model.description}</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{model.id}</code>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="prompts" className="space-y-4">
              {/* Create/Edit Prompt Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {editingPrompt ? 'Edit Prompt' : 'Create New Prompt'}
                  </CardTitle>
                  <CardDescription>
                    Create custom system prompts for different use cases with specific AI models
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="prompt-name">Prompt Name</Label>
                    <Input
                      id="prompt-name"
                      value={promptName}
                      onChange={(e) => setPromptName(e.target.value)}
                      placeholder="e.g., Customer Support, Sales Enquiries"
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model-select">AI Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger id="model-select">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</SelectItem>
                        <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                        <SelectItem value="google/gemini-3-pro-preview">Gemini 3 Pro Preview</SelectItem>
                        <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                        <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                        <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                        <SelectItem value="openai/gpt-5-nano">GPT-5 Nano</SelectItem>
                        {hasAnthropicKey && (
                          <>
                            <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                            <SelectItem value="claude-opus-4-1-20250805">Claude Opus 4.1</SelectItem>
                            <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                            <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="system-prompt">System Prompt</Label>
                    <Textarea
                      id="system-prompt"
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      placeholder="Enter your system prompt here..."
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {promptText.length} characters
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSavePrompt} disabled={isSaving || !promptName || !promptText}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving...' : editingPrompt ? 'Update Prompt' : 'Create Prompt'}
                    </Button>
                    {editingPrompt && (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setEditingPrompt(null);
                          setPromptName('');
                          setPromptText('');
                          setSelectedModel('google/gemini-2.5-flash');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Saved Prompts List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Saved Prompts</CardTitle>
                  <CardDescription>
                    Manage your custom AI prompts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {prompts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No prompts created yet.</p>
                  ) : (
                    prompts.map((prompt) => (
                      <Card key={prompt.id} className="border-border/50">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium">{prompt.name}</h4>
                                {prompt.isDefault && (
                                  <Badge variant="default" className="text-xs">Default</Badge>
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  {prompt.model}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {prompt.prompt}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditPrompt(prompt)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              {!prompt.isDefault ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSetDefault(prompt.id)}
                                >
                                  Set Default
                                </Button>
                              ) : (
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled
                                >
                                  Current Default
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeletePrompt(prompt.id)}
                                disabled={prompt.isDefault}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    💡 Best Practices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Be specific about the agent's role and tone</li>
                    <li>Include key business information and policies</li>
                    <li>Specify when to escalate to human agents</li>
                    <li>Define response length and format preferences</li>
                    <li>Add examples for complex scenarios</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
