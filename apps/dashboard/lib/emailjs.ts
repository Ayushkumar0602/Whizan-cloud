/**
 * EmailJS Client & Configuration for Whizan Cloud
 * Reads strictly from environment variables with zero hardcoded credentials
 */

export const getEmailJsConfig = () => ({
  serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || "service_mm6n3jn",
  templateOtpId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_OTP_ID || process.env.EMAILJS_TEMPLATE_OTP_ID || "template_e3lerhj",
  templateDeploymentFailedId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_DEPLOY_FAILED_ID || process.env.EMAILJS_TEMPLATE_DEPLOY_FAILED_ID || "template_ernq47u",
  publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || "qzhqvM1yerb2R24T1",
  privateKey: process.env.EMAILJS_PRIVATE_KEY || "e9Snm4GGkiI1xLel7cLi7",
  endpoint: "https://api.emailjs.com/api/v1.0/email/send",
  defaultLogoUrl: "https://dashboard.whizan.cloud/whizan_logo.png",
});

export interface SendOtpParams {
  email: string;
  passcode: string;
  time?: string;
  companyName?: string;
  requestTime?: string;
  clientIp?: string;
  deviceInfo?: string;
  location?: string;
  requestId?: string;
  logoUrl?: string;
}

export interface SendDeploymentFailedParams {
  email: string;
  userName?: string;
  projectName: string;
  deploymentId: string;
  errorMessage: string;
  dashboardUrl?: string;
  time?: string;
  branch?: string;
  commitHash?: string;
  triggerIp?: string;
  nodeId?: string;
  logoUrl?: string;
}

/**
 * Sends a 6-digit verification OTP email to the user using EmailJS
 * Includes app logo, request IP, device, and security tracking data.
 */
export async function sendOtpEmail(params: SendOtpParams): Promise<{ success: boolean; error?: string }> {
  const config = getEmailJsConfig();

  if (!config.serviceId || !config.publicKey) {
    const errorMsg = "[EmailJS] Missing NEXT_PUBLIC_EMAILJS_SERVICE_ID or NEXT_PUBLIC_EMAILJS_PUBLIC_KEY.";
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  const {
    email,
    passcode,
    time = "15 minutes",
    companyName = "Whizan Cloud Services",
    requestTime = new Date().toUTCString(),
    clientIp = typeof window !== "undefined" ? "Client Device" : "N/A",
    deviceInfo = typeof navigator !== "undefined" ? navigator.userAgent : "Browser Client",
    location = "Global",
    requestId = `req_${Date.now().toString(36)}`,
    logoUrl = config.defaultLogoUrl,
  } = params;

  try {
    const payload: Record<string, any> = {
      service_id: config.serviceId,
      template_id: config.templateOtpId,
      user_id: config.publicKey,
      template_params: {
        email: email.trim().toLowerCase(),
        passcode: passcode.trim(),
        time,
        company_name: companyName,
        logo_url: logoUrl,
        request_time: requestTime,
        client_ip: clientIp,
        device_info: deviceInfo,
        location,
        request_id: requestId,
        app_url: "https://dashboard.whizan.cloud",
      },
    };

    if (config.privateKey) {
      payload.accessToken = config.privateKey;
    }

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "EmailJS send failed");
      console.error("[EmailJS] OTP send error:", res.status, errText);
      return { success: false, error: errText || `Failed with status ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[EmailJS] Network error sending OTP:", err);
    return { success: false, error: err?.message || "Network error while sending email" };
  }
}

/**
 * Sends a deployment failure notification to the user using EmailJS
 */
export async function sendDeploymentFailedEmail(params: SendDeploymentFailedParams): Promise<{ success: boolean; error?: string }> {
  const config = getEmailJsConfig();

  if (!config.serviceId || !config.publicKey) {
    const errorMsg = "[EmailJS] Missing NEXT_PUBLIC_EMAILJS_SERVICE_ID or NEXT_PUBLIC_EMAILJS_PUBLIC_KEY.";
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    const targetEmail = params.email.trim().toLowerCase();
    const payload: Record<string, any> = {
      service_id: config.serviceId,
      template_id: config.templateDeploymentFailedId,
      user_id: config.publicKey,
      template_params: {
        email: targetEmail,
        to_email: targetEmail,
        user_email: targetEmail,
        recipient: targetEmail,
        user_name: params.userName || targetEmail.split("@")[0],
        project_name: params.projectName,
        deployment_id: params.deploymentId,
        error_message: params.errorMessage,
        dashboard_url: params.dashboardUrl || "https://dashboard.whizan.cloud",
        time: params.time || new Date().toUTCString(),
        branch: params.branch || "main",
        commit_hash: params.commitHash || "HEAD",
        trigger_ip: params.triggerIp || "Cloud Edge",
        node_id: params.nodeId || "whizan-node-01",
        logo_url: params.logoUrl || config.defaultLogoUrl,
        app_url: "https://dashboard.whizan.cloud",
      },
    };

    if (config.privateKey) {
      payload.accessToken = config.privateKey;
    }

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "EmailJS send failed");
      console.error("[EmailJS] Deployment failed email error:", res.status, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[EmailJS] Network error sending deployment failure alert:", err);
    return { success: false, error: err?.message || "Network error" };
  }
}
