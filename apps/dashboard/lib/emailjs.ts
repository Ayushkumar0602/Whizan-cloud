/**
 * EmailJS Client & Configuration for Whizan Cloud
 * Service ID: service_mm6n3jn
 * Public Key: qzhqvM1yerb2R24T1
 * Private Key (Access Token): e9Snm4GGkiI1xLel7cLi7
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

export interface SendOtpParams {
  email: string;
  passcode: string;
  time?: string;
  companyName?: string;
}

export interface SendDeploymentFailedParams {
  email: string;
  userName?: string;
  projectName: string;
  deploymentId: string;
  errorMessage: string;
  dashboardUrl?: string;
  time?: string;
}

/**
 * Sends a 6-digit verification OTP email to the user using EmailJS template_e3lerhj
 */
export async function sendOtpEmail(params: SendOtpParams): Promise<{ success: boolean; error?: string }> {
  const { email, passcode, time = "15 minutes", companyName = "Whizan Cloud" } = params;

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
 * Sends a deployment failure notification to the user using EmailJS template_ernq47u
 */
export async function sendDeploymentFailedEmail(params: SendDeploymentFailedParams): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateDeploymentFailedId,
      user_id: EMAILJS_CONFIG.publicKey,
      accessToken: EMAILJS_CONFIG.privateKey,
      template_params: {
        email: params.email.trim().toLowerCase(),
        user_name: params.userName || params.email.split("@")[0],
        project_name: params.projectName,
        deployment_id: params.deploymentId,
        error_message: params.errorMessage,
        dashboard_url: params.dashboardUrl || "https://dashboard.whizan.cloud",
        time: params.time || new Date().toUTCString(),
      },
    };

    const res = await fetch(EMAILJS_CONFIG.endpoint, {
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
