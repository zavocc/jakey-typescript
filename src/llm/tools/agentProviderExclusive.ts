export class AgentProviderExclusiveError extends Error {
  public readonly message = "The tool you selected is not available for this model. Switch to a different model or switch tools.";

  public constructor(
    public readonly toolSelection: string,
    public readonly exclusiveProvider: string,
  ) {
    super(`The tool ${toolSelection} is exclusive to ${exclusiveProvider} provider.`);
    this.name = "AgentProviderExclusiveError";
  }
}

export function assertAgentProviderExclusive(toolSelection: string | null | undefined,  expectedProvider: string | undefined, currentProvider: string): void {
  if (!expectedProvider || expectedProvider === currentProvider) {
    return;
  }

  throw new AgentProviderExclusiveError(toolSelection ?? "Disabled", expectedProvider);
}
