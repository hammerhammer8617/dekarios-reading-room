export async function syncCurrentContext(input: {
  context: Record<string, unknown>;
  successPrompt: string;
  fallbackPrompt: string;
  updateModelContext: (context: Record<string, unknown>) => Promise<boolean>;
  sendMessage: (
    prompt: string,
    options?: { scrollToBottom?: boolean }
  ) => Promise<void>;
}) {
  const updated = await input.updateModelContext(input.context);
  const novelCurrentOnlyMissingText =
    input.context.type === "novel" &&
    input.context.mode === "current_only" &&
    !hasString(input.context.currentText) &&
    !hasString(input.context.selectedText) &&
    !hasString(input.context.includedText);
  await input.sendMessage(
    updated && !novelCurrentOnlyMissingText ? input.successPrompt : input.fallbackPrompt,
    { scrollToBottom: false }
  );
  return updated ? ("context" as const) : ("message-fallback" as const);
}

function hasString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}
