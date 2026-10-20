/**
 * Server-side EmailJS Dispatcher for Whizan Cloud
 * Service ID: service_mm6n3jn
 * Public Key: qzhqvM1yerb2R24T1
 * Private Key: e9Snm4GGkiI1xLel7cLi7
 * OTP Template: template_e3lerhj
 * Deployment Failed Template: template_ernq47u
 */

export const EMAILJS_CONFIG = {
  serviceId: "service_mm6n3jn",
  templateOtpId: "template_e3lerhj",
  templateDeploymentFailedId: "template_ernq47u",
  publicKey: "qzhqvM1yerb2R24T1",
  privateKey: "e9Snm4GGkiI1xLel7cLi7",
  endpoint: "https://api.emailjs.com/api/v1.0/email/send",
};

export interface SendOtpOptions {
  email: string;
  passcode: string;
  time?: string;
  companyName?: string;
}

export interface SendDeploymentFailedOptions {
  email: string;
  userName?: string;
  projectName: string;
  deploymentId: string;
  errorMessage: string;
  dashboardUrl?: string;
  time?: string;
}

/**
 * Sends a registration OTP code to user's email via EmailJS (template_e3lerhj)
 */
export async function sendOtpEmail(options: SendOtpOptions): Promise<{ success: boolean; error?: string }> {
  const { email, passcode, time = "15 minutes", companyName = "Whizan Cloud" } = options;

  try {
    const payload = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateOtpId,
      user_id: EMAILJS_CONFIG.publicKey,
      accessToken: EMAILJS_CONFIG.privateKey,
      template_params: {
        email: email.trim().toLowerCase(),
        passcode: passcode.trim(),
        time,
        company_name: companyName,
      },
    };

    const res = await fetch(EMAILJS_CONFIG.endpoint, {
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
 * Sends a deployment failure notification to user's email via EmailJS (template_ernq47u)
 */
export async function sendDeploymentFailedEmail(options: SendDeploymentFailedOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateDeploymentFailedId,
      user_id: EMAILJS_CONFIG.publicKey,
      accessToken: EMAILJS_CONFIG.privateKey,
      template_params: {
        email: options.email.trim().toLowerCase(),
        user_name: options.userName || options.email.split("@")[0],
        project_name: options.projectName,
        deployment_id: options.deploymentId,
        error_message: options.errorMessage,
        dashboard_url: options.dashboardUrl || "https://dashboard.whizan.cloud",
        time: options.time || new Date().toUTCString(),
      },
    };

    const res = await fetch(EMAILJS_CONFIG.endpoint, {
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
