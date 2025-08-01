import {
  initLlama,
  initMultimodal,
  multimodalCompletion,
  LlamaContext,
} from './index'
import type {
  ContextParams,
  CompletionParams,
  CactusOAICompatibleMessage,
  NativeCompletionResult,
} from './index'
import { Telemetry } from './telemetry'
import { setCactusToken, getTextCompletion, getVisionCompletion } from './remote'

interface CactusVLMReturn {
  vlm: CactusVLM | null
  error: Error | null
}

export type VLMContextParams = ContextParams & {
  mmproj: string
}

export type VLMCompletionParams = Omit<CompletionParams, 'prompt'> & {
  images?: string[]
  mode?: string
}

export class CactusVLM {
  private context: LlamaContext
  
  private constructor(context: LlamaContext) {
    this.context = context
  }

  static async init(
    params: VLMContextParams,
    onProgress?: (progress: number) => void,
    cactusToken?: string,
  ): Promise<CactusVLMReturn> {
    if (cactusToken) {
      setCactusToken(cactusToken);
    }

    const configs = [
      params,
      { ...params, n_gpu_layers: 0 } 
    ];

    for (const config of configs) {
      try {
        const context = await initLlama(config, onProgress)
        await initMultimodal(context.id, params.mmproj, false)
        return {vlm: new CactusVLM(context), error: null}
      } catch (e) {
        Telemetry.error(e as Error, {
          n_gpu_layers: config.n_gpu_layers ?? null,
          n_ctx: config.n_ctx ?? null,
          model: config.model ?? null,
        });
        if (configs.indexOf(config) === configs.length - 1) {
          return {vlm: null, error: e as Error}
        }
      }
    }

    return {vlm: null, error: new Error('Failed to initialize CactusVLM')}
  }

  async completion(
    messages: CactusOAICompatibleMessage[],
    params: VLMCompletionParams = {},
    callback?: (data: any) => void,
  ): Promise<NativeCompletionResult> {
    const mode = params.mode || 'local';

    let result: NativeCompletionResult;
    let lastError: Error | null = null;

    if (mode === 'remote') {
      result = await this._handleRemoteCompletion(messages, params, callback);
    } else if (mode === 'local') {
      result = await this._handleLocalCompletion(messages, params, callback);
    } else if (mode === 'localfirst') {
      try {
        result = await this._handleLocalCompletion(messages, params, callback);
      } catch (e) {
        lastError = e as Error;
        try {
          result = await this._handleRemoteCompletion(messages, params, callback);
        } catch (remoteError) {
          throw lastError;
        }
      }
    } else if (mode === 'remotefirst') {
      try {
        result = await this._handleRemoteCompletion(messages, params, callback);
      } catch (e) {
        lastError = e as Error;
        try {
          result = await this._handleLocalCompletion(messages, params, callback);
        } catch (localError) {
          throw lastError;
        }
      }
    } else {
      throw new Error('Invalid mode: ' + mode + '. Must be "local", "remote", "localfirst", or "remotefirst"');
    }

    return result;
  }

  private async _handleLocalCompletion(
    messages: CactusOAICompatibleMessage[],
    params: VLMCompletionParams,
    callback?: (data: any) => void,
  ): Promise<NativeCompletionResult> {
    if (params.images && params.images.length > 0) {
      const formattedPrompt = await this.context.getFormattedChat(messages)
      const prompt =
        typeof formattedPrompt === 'string'
          ? formattedPrompt
          : formattedPrompt.prompt
      return await multimodalCompletion(
        this.context.id,
        prompt,
        params.images,
        { ...params, prompt, emit_partial_completion: !!callback },
      )
    } else {
      return await this.context.completion({ messages, ...params }, callback)
    }
  }

  private async _handleRemoteCompletion(
    messages: CactusOAICompatibleMessage[],
    params: VLMCompletionParams,
    callback?: (data: any) => void,
  ): Promise<NativeCompletionResult> {
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const imagePath = params.images && params.images.length > 0 ? params.images[0] : '';
    
    let responseText: string;
    if (imagePath) {
      responseText = await getVisionCompletion(prompt, imagePath);
    } else {
      responseText = await getTextCompletion(prompt);
    }
    
    if (callback) {
      for (let i = 0; i < responseText.length; i++) {
        callback({ token: responseText[i] });
      }
    }
    
    return {
      text: responseText,
      reasoning_content: '',
      tool_calls: [],
      content: responseText,
      tokens_predicted: responseText.split(' ').length,
      tokens_evaluated: prompt.split(' ').length,
      truncated: false,
      stopped_eos: true,
      stopped_word: '',
      stopped_limit: 0,
      stopping_word: '',
      tokens_cached: 0,
      timings: {
        prompt_n: prompt.split(' ').length,
        prompt_ms: 0,
        prompt_per_token_ms: 0,
        prompt_per_second: 0,
        predicted_n: responseText.split(' ').length,
        predicted_ms: 0,
        predicted_per_token_ms: 0,
        predicted_per_second: 0,
      },
    };
  }

  async rewind(): Promise<void> {
    // @ts-ignore
    return this.context?.rewind()
  }

  async release(): Promise<void> {
    return this.context.release()
  }
} 