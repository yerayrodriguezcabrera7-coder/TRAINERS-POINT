// Cognito's public user-pool API needs an app client WITHOUT a client secret.
// Everything here is opt-in. No AWS request is made by the default local login.
export class CognitoPasswordRequired extends Error {
  constructor() { super("Cambia tu contraseña provisional para continuar."); }
}

export class CognitoAuth {
  private accessToken?: string;
  private challenge?: { session: string; username: string };
  private readonly endpoint: string;

  constructor(private readonly userPoolId: string, private readonly clientId: string) {
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(userPoolId) || !/^[a-z0-9]{1,128}$/.test(clientId))
      throw new Error("Falta configurar el acceso de Cognito del centro.");
    const region = userPoolId.split("_")[0];
    this.endpoint = `https://cognito-idp.${region}.${region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com"}/`;
  }

  private async call(operation: string, body: Record<string, unknown>): Promise<Record<string, any>> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${operation}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = String(data?.__type || "").split("#").pop();
        if (code === "InvalidPasswordException" || code === "PasswordHistoryPolicyViolationException")
          throw new Error("La nueva contraseña no cumple los requisitos del centro o ya se ha utilizado.");
        if (code === "TooManyRequestsException" || code === "LimitExceededException")
          throw new Error("Demasiados intentos. Espera unos minutos antes de volver a entrar.");
        if (code === "UserNotConfirmedException" || code === "PasswordResetRequiredException")
          throw new Error("Contacta con recepción para confirmar o recuperar tu acceso.");
        throw new Error("Usuario o contraseña incorrectos, o acceso caducado. Vuelve a entrar.");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Respuesta de acceso no válida.");
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("El acceso tarda demasiado. Inténtalo de nuevo.");
      if (error instanceof TypeError) throw new Error("No se puede conectar con el servicio de acceso. Comprueba la conexión.");
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private result(data: Record<string, any>, username: string): string {
    if (data.ChallengeName === "NEW_PASSWORD_REQUIRED" && typeof data.Session === "string") {
      const required = data.ChallengeParameters?.requiredAttributes;
      if (required && required !== "[]")
        throw new Error("Recepción debe completar los datos de tu cuenta antes de activar el acceso.");
      this.challenge = { session: data.Session, username: data.ChallengeParameters?.USER_ID_FOR_SRP || username };
      throw new CognitoPasswordRequired();
    }
    if (data.ChallengeName) {
      this.clear();
      throw new Error("Tu cuenta requiere una verificación adicional que todavía no está disponible en la app. Contacta con recepción.");
    }
    const token = data.AuthenticationResult?.AccessToken;
    if (typeof token !== "string" || !token) throw new Error("El servicio de acceso no ha devuelto una sesión válida.");
    this.challenge = undefined;
    this.accessToken = token;
    return token;
  }

  async login(username: string, password: string): Promise<string> {
    this.clear();
    return this.result(await this.call("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH", ClientId: this.clientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }), username);
  }
  hasPasswordChallenge() { return !!this.challenge; }
  async completePassword(newPassword: string): Promise<string> {
    if (!this.challenge) throw new Error("Vuelve a iniciar sesión antes de cambiar la contraseña.");
    const { session, username } = this.challenge;
    return this.result(await this.call("RespondToAuthChallenge", {
      ClientId: this.clientId, ChallengeName: "NEW_PASSWORD_REQUIRED", Session: session,
      ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
    }), username);
  }
  async changePassword(currentPassword: string, newPassword: string) {
    if (!this.accessToken) throw new Error("Vuelve a iniciar sesión para cambiar la contraseña.");
    await this.call("ChangePassword", { AccessToken: this.accessToken, PreviousPassword: currentPassword, ProposedPassword: newPassword });
    return { ok: true };
  }
  clear() { this.accessToken = undefined; this.challenge = undefined; }
}

export function mobileCognito(provider?: string, userPoolId?: string, clientId?: string): CognitoAuth | undefined {
  if (!provider || provider === "local") return undefined;
  if (provider !== "cognito") throw new Error("EXPO_PUBLIC_AUTH_PROVIDER debe ser local o cognito.");
  return new CognitoAuth(userPoolId?.trim() || "", clientId?.trim() || "");
}
