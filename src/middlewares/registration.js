const { registerOrUpdateUser } = require('../services/userService');

function registrationMiddleware(registerUser = registerOrUpdateUser) {
  return async (ctx, next) => {
    if (ctx.from) {
      const registration = await registerUser(ctx.from);
      ctx.dbUser = registration.user;
      ctx.isNewUser = registration.isNew;
    }
    return next();
  };
}

module.exports = { registrationMiddleware };
