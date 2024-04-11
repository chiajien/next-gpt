"use client";
import {
  ApiPath,
  DEFAULT_API_HOST,
  DEFAULT_MODELS,
  HUGGING_FACE_BASE_URL,
  OpenaiPath,
  HuggingFace,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
} from "@/app/constant";
import { useAccessStore, useAppConfig, useChatStore } from "@/app/store";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
} from "../api";
import Locale from "../../locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { moderateText } from "./textmoderation";
import { getNewStuff, getModelForInstructVersion } from "./NewStuffLLMs";
import { prettyObject } from "@/app/utils/format";
import { getClientConfig } from "@/app/config/client";
import { getProviderFromState } from "@/app/utils";
import { makeAzurePath } from "@/app/azure";
import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
} from "@/app/utils";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export class StableDifusionApi implements LLMApi {
  private disableListModels = true;
  path(path: string): string {
    console.log("path");

    let baseUrl = HUGGING_FACE_BASE_URL;
    baseUrl += ApiPath.HuggingFace;

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !baseUrl.startsWith(ApiPath.HuggingFace)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    console.log("extractMessage");
    return res.choices?.at(0)?.message?.content ?? "";
  }

  async chat(options: ChatOptions) {
    console.log("chat");
    const visionModel = isVisionModel(options.config.model);
    const userMessageS = options.messages.filter((msg) => msg.role === "user");

    const lastUserMessageContent =
      userMessageS[userMessageS.length - 1]?.content;

    let textToModerate = "";

    if (typeof lastUserMessageContent === "string") {
      textToModerate = lastUserMessageContent;
    } else if (Array.isArray(lastUserMessageContent)) {
      // If it's an array of MultimodalContent, concatenate all text elements into a single string
      textToModerate = lastUserMessageContent
        .filter(
          (content) =>
            content.type === "text" && typeof content.text === "string",
        )
        .map((content) => content.text)
        .join(" ");
    }

    const messages = options.messages.map((v) => ({
      role: v.role,
      content: visionModel ? v.content : getMessageTextContent(v),
    }));

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const cfgspeed_animation = useAppConfig.getState().speed_animation;

    const defaultModel = modelConfig.model;

    const userMessages = messages.filter((msg) => msg.role === "user");
    const userMessage = userMessages[userMessages.length - 1]?.content;
    const shouldStream = false;

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPayload = {
        method: "POST",
        body: JSON.stringify({ inputs: userMessage }),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      if (shouldStream) {
        let responseText = "";
        let remainText = "";
        let finished = false;

        // animate response to make it looks smooth
        function animateResponseText() {
          console.log("animateResponseText");
          if (finished || controller.signal.aborted) {
            responseText += remainText;
            console.log("[Response Animation] finished");
            return;
          }

          if (remainText.length > 0) {
            const fetchCount = Math.max(
              1,
              Math.round(remainText.length / cfgspeed_animation),
            ); // Lower values will result in faster animation
            const fetchText = remainText.slice(0, fetchCount);
            responseText += fetchText;
            remainText = remainText.slice(fetchCount);
            options.onUpdate?.(responseText, fetchText);
          }

          requestAnimationFrame(animateResponseText);
        }

        // start animaion
        animateResponseText();

        const finish = () => {
          console.log("finish");
          if (!finished) {
            finished = true;
            options.onFinish(responseText + remainText);
          }
        };

        controller.signal.onabort = finish;

        fetchEventSource(
          HUGGING_FACE_BASE_URL +
            ApiPath.HuggingFace +
            HuggingFace.StableDifusionPath,
          {
            ...chatPayload,
            headers: {
              Authorization: `Bearer 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`,
            },
            async onopen(res) {
              console.log("onopen");
              clearTimeout(requestTimeoutId);
              const contentType = res.headers.get("content-type");
              console.log(
                `[ServiceProvider] request response content type: `,
                contentType,
              );

              try {
                if (contentType?.startsWith("text/plain")) {
                  responseText = await res.text();
                } else if (contentType?.startsWith("image/jpeg")) {
                  let blob = await res.blob();

                  const url = `https://api.cloudinary.com/v1_1/dyguhpoam/upload`;
                  const data = new FormData();
                  data.append("file", blob);
                  data.append("upload_preset", "jjzqfxkw");

                  const fetched = await fetch(url, {
                    method: "post",
                    body: data,
                  });

                  const parsed = await fetched.json();
                  console.log(parsed.url);

                  let imageDescription = `#### ${userMessage} (${1})\n\n\n | ![${
                    parsed.url
                  }](${
                    parsed.url
                  }) |\n|---|\n| Size: 1024x1024 |\n| [Download Here](${
                    parsed.url
                  }) |\n| 🤖 AI Models: ${defaultModel} |`;

                  responseText = `${imageDescription}`;
                  return;
                } else {
                  // Handle other content types (e.g., binary data) here
                  console.log("Received content type:", contentType);
                  return;
                }

                if (
                  !res.ok ||
                  !res.headers
                    .get("content-type")
                    ?.startsWith(EventStreamContentType) ||
                  res.status !== 200
                ) {
                  let extraInfo = await res.clone().text();
                  try {
                    const resJson = await res.clone().json();
                    extraInfo = prettyObject(resJson);
                  } catch {}

                  const responseTexts = [responseText];
                  if (res.status === 401) {
                    responseTexts.push(Locale.Error.Unauthorized);
                  }

                  if (extraInfo) {
                    responseTexts.push(extraInfo);
                  }

                  responseText = responseTexts.join("\n\n");
                  return finish();
                }
              } catch (error) {
                console.error("Error processing response:", error);
              }
            },
            onmessage(msg) {
              console.log("onmessage");
              if (msg.data === "[DONE]" || finished) {
                return finish();
              }
              const text = msg.data;
              try {
                const json = JSON.parse(text);
                const choices = json.choices as Array<{
                  delta: { content: string };
                }>;
                const delta = choices[0]?.delta?.content;
                const textmoderation = json?.prompt_filter_results;

                if (delta) {
                  remainText += delta;
                }
              } catch (e) {
                console.error("[Request] parse error", text, msg);
              }
            },
            onclose() {
              console.log("onclose");
              finish();
            },
            onerror(e) {
              console.log("onerror");
              console.log(e.message);
              options.onError?.(e);
              throw e;
            },
            openWhenHidden: true,
          },
        );
      } else {
        const res = await fetch(
          HUGGING_FACE_BASE_URL +
            ApiPath.HuggingFace +
            HuggingFace.StableDifusionPath,
          {
            ...chatPayload,
            headers: {
              Authorization: `Bearer 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`,
            },
          },
        );

        clearTimeout(requestTimeoutId);

        let blob = await res.blob();
        const url = `https://api.cloudinary.com/v1_1/dyguhpoam/upload`;
        const data = new FormData();
        data.append("file", blob);
        data.append("upload_preset", "jjzqfxkw");

        const fetched = await fetch(url, {
          method: "post",
          body: data,
        });

        const parsed = await fetched.json();
        console.log(parsed.url);

        let imageDescription = `#### ${userMessage} (${1})\n\n\n | ![${
          parsed.url
        }](${parsed.url}) |\n|---|\n| Size: 1024x1024 |\n| [Download Here](${
          parsed.url
        }) |\n| 🤖 AI Models: ${defaultModel} |`;

        let responseText = `${imageDescription}`;
        options.onFinish(responseText);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }

  async usage() {
    console.log("usage");

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
      system_hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    if (total.system_hard_limit_usd) {
      total.system_hard_limit_usd =
        Math.round(total.system_hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: {
        hard_limit_usd: total.hard_limit_usd,
        system_hard_limit_usd: total.system_hard_limit_usd,
      },
    } as unknown as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    console.log("model");
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter((m) => m.id.startsWith("gpt-"));
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
      },
    }));
  }

  private async saveImageFromResponse(
    imageResponse: any,
    filename: string,
  ): Promise<void> {
    try {
      const blob = await imageResponse.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);

      console.log("Image saved successfully:", filename);
    } catch (e) {
      console.error("Failed to save image:", e);
    }
  }
}

export { HuggingFace };
