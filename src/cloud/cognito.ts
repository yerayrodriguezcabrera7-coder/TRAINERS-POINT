import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { JwksCache } from "aws-jwt-verify/jwk";
import { ApiError } from "../calendar/model";

export type CognitoIdentity = { issuer: string; subject: string; expiresAt: number };
export type CognitoVerifier = (accessToken: string) => Promise<CognitoIdentity>;

export function cognitoConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.COGNITO_ENABLED || env.COGNITO_ENABLED === "false") return null;
  if (env.COGNITO_ENABLED !== "true") throw Error("COGNITO_ENABLED debe ser true o false.");
  const userPoolId = env.COGNITO_USER_POOL_ID?.trim() || "";
  const clientId = env.COGNITO_CLIENT_ID?.trim() || "";
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(userPoolId) || !/^[a-z0-9]{1,128}$/.test(clientId))
    throw Error("Configura COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID antes de activar Cognito.");
  const region = userPoolId.split("_")[0];
  const domain = region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com";
  return { userPoolId, clientId, issuer: `https://cognito-idp.${region}.${domain}/${userPoolId}` };
}

// No AWS credentials, infrastructure creation or network requests at startup.
// Public signing keys are fetched lazily on the first enabled login and cached.
export function createCognitoVerifier(env: NodeJS.ProcessEnv = process.env, jwksCache?: JwksCache): CognitoVerifier | undefined {
  const config = cognitoConfig(env);
  if (!config) return undefined;
  const verifier = CognitoJwtVerifier.create({ userPoolId: config.userPoolId, clientId: config.clientId, tokenUse: "access" }, jwksCache ? { jwksCache } : undefined);
  return async accessToken => {
    try {
      const claims = await verifier.verify(accessToken);
      if (typeof claims.sub !== "string" || !claims.sub || claims.iss !== config.issuer)
        throw Error("Invalid identity");
      return { issuer: claims.iss, subject: claims.sub, expiresAt: claims.exp * 1000 };
    } catch {
      // Never expose a JWT, AWS error response, password or claim in logs/errors.
      throw new ApiError(401, "El acceso de Cognito no es válido o ha caducado. Vuelve a iniciar sesión.");
    }
  };
}
