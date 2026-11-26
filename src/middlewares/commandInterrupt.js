function createCommandInterruptMiddleware({ onStart, onCancel }) {
  return async (ctx, next) => {
    const text = String(ctx.message?.text || '').trim();
    if (!/^\/(?:start|cancel)(?:@\S+)?(?:\s|$)/i.test(text)) return next();

    if (ctx.scene?.current) {
      try {
        await ctx.scene.leave();
      } catch (error) {
        return onCancel(ctx, error);
      }
    }

    const command = text.split(/\s/, 1)[0].split('@', 1)[0].toLowerCase();
    if (command === '/cancel') return onCancel(ctx);
    return onStart(ctx);
  };
}

module.exports = { createCommandInterruptMiddleware };
