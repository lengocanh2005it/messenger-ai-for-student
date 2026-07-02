export interface DiscordAgentToolContext {
  discordUserId: string;
  /** WISPACE userId if the Discord account is linked; undefined otherwise. */
  userId?: number;
}

export interface DiscordAgentReply {
  text: string;
}

export interface DiscordAgentInput {
  discordUserId: string;
  userId?: number;
  userText: string;
  /** Discord message id — LLM usage correlation id. */
  correlationId?: string;
}
