/**
 * Server-side EmailJS Dispatcher for Whizan Cloud
 * Reads strictly from process.env with zero hardcoded credentials
 */

export const getEmailJsConfig = () => ({
  serviceId: process.env.EMAILJS_SERVICE_ID || "",
  templateOtpId: process.env.EMAILJS_TEMPLATE_OTP_ID || "",
  templateDeploymentFailedId: process.env.EMAILJS_TEMPLATE_DEPLOY_FAILED_ID || "",
  publicKey: process.env.EMAILJS_PUBLIC_KEY || "",
  privateKey: process.env.EMAILJS_PRIVATE_KEY || "",
  endpoint: process.env.EMAILJS_ENDPOINT || "https://api.emailjs.com/api/v1.0/email/send",
  defaultLogoUrl: process.env.EMAILJS_LOGO_URL || "https://dashboard.whizan.cloud/whizan_logo.png",
});

export interface SendOtpOptions {
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

export interface SendDeploymentFailedOptions {
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
 * Sends a registration OTP code to user's email via EmailJS
 * Includes app logo, request IP, device info, location, and security audit data.
 */
export async function sendOtpEmail(options: SendOtpOptions): Promise<{ success: boolean; error?: string }> {
  const config = getEmailJsConfig();

  if (!config.serviceId || !config.publicKey || !config.privateKey) {
    const errorMsg = "[EmailService] Missing required EmailJS environment variables (EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, or EMAILJS_PRIVATE_KEY).";
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  const {
    email,
    passcode,
    time = "15 minutes",
    companyName = "Whizan Cloud Services",
    requestTime = new Date().toUTCString(),
    clientIp = "N/A",
    deviceInfo = "Standard Browser",
    location = "Global",
    requestId = `req_${Date.now().toString(36)}`,
    logoUrl = config.defaultLogoUrl,
  } = options;

  try {
    const payload = {
      service_id: config.serviceId,
      template_id: config.templateOtpId,
      user_id: config.publicKey,
      accessToken: config.privateKey,
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

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://dashboard.whizan.cloud",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      console.error("[EmailService] Failed to send OTP email:", res.status, text);
      return { success: false, error: text };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[EmailService] Network error sending OTP:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sends a deployment failure notification to user's email via EmailJS
 * Includes app logo, failure diagnostics, commit/branch metadata, node ID, and console links.
 */
export async function sendDeploymentFailedEmail(options: SendDeploymentFailedOptions): Promise<{ success: boolean; error?: string }> {
  const config = getEmailJsConfig();

  if (!config.serviceId || !config.publicKey || !config.privateKey) {
    const errorMsg = "[EmailService] Missing required EmailJS environment variables (EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, or EMAILJS_PRIVATE_KEY).";
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    const payload = {
      service_id: config.serviceId,
      template_id: config.templateDeploymentFailedId,
      user_id: config.publicKey,
      accessToken: config.privateKey,
      template_params: {
        email: options.email.trim().toLowerCase(),
        user_name: options.userName || options.email.split("@")[0],
        project_name: options.projectName,
        deployment_id: options.deploymentId,
        error_message: options.errorMessage,
        dashboard_url: options.dashboardUrl || "https://dashboard.whizan.cloud",
        time: options.time || new Date().toUTCString(),
        branch: options.branch || "main",
        commit_hash: options.commitHash ? options.commitHash.slice(0, 8) : "direct-upload",
        trigger_ip: options.triggerIp || "Cloud Edge",
        node_id: options.nodeId || "whizan-node-01",
        logo_url: options.logoUrl || config.defaultLogoUrl,
        app_url: "https://dashboard.whizan.cloud",
      },
    };

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://dashboard.whizan.cloud",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      console.error("[EmailService] Failed to send deployment failure alert:", res.status, text);
      return { success: false, error: text };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[EmailService] Network error sending failure alert:", err.message);
    return { success: false, error: err.message };
  }
}
