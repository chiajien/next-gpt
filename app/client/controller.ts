// To store message streaming controller
export const ChatControllerPool = {
  controllers: {} as Record<string, AbortController>,

  addController(
    sessionId: string,
    messageId: string,
    controller: AbortController,
  ) {
    console.log("add controller");
    const key = this.key(sessionId, messageId);
    this.controllers[key] = controller;
    return key;
  },

  stop(sessionId: string, messageId: string) {
    console.log("stop");
    const key = this.key(sessionId, messageId);
    const controller = this.controllers[key];
    controller?.abort();
  },

  stopAll() {
    console.log("stopAll");
    Object.values(this.controllers).forEach((v) => v.abort());
  },

  hasPending() {
    console.log("hasPending");
    return Object.values(this.controllers).length > 0;
  },

  remove(sessionId: string, messageId: string) {
    console.log("remove");
    const key = this.key(sessionId, messageId);
    delete this.controllers[key];
  },

  key(sessionId: string, messageIndex: string) {
    console.log("key");
    return `${sessionId},${messageIndex}`;
  },
};
