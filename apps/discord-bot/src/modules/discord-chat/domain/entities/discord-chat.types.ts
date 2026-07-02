export interface DiscordAgentToolContext {
  discordUserId: string;
  /** WISPACE userId if the Discord account is linked; undefined otherwise. */
  userId?: number;
  /** True when the message came from a server channel (not a DM). */
  isServerChannel: boolean;
  /**
   * Mutated to true by any tool that fetches personal data (schedule, scores,
   * goals). Gateway uses this flag to route the reply to DM instead of the
   * server channel, preserving user privacy.
   */
  privateDataFetched: boolean;
}

export interface DiscordAgentReply {
  text: string;
  /** Mirrors DiscordAgentToolContext.privateDataFetched after agent run. */
  privateDataFetched: boolean;
}

export interface DiscordAgentInput {
  discordUserId: string;
  userId?: number;
  userText: string;
  /** Discord message id — LLM usage correlation id. */
  correlationId?: string;
  isServerChannel: boolean;
}
