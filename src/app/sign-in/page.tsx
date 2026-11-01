import { AccountForm } from "@/components/AccountForm";

export const dynamic = "force-dynamic";
export default function SignInPage() {
  return <AccountForm emailDelivery={Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)} />;
}
