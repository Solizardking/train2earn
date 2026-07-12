import { PaymentButton } from "@solana-commerce/kit";

export type SkillPaymentButtonProps = {
  skillSlug: string;
  merchantName?: string;
  merchantWallet: string;
  network?: "mainnet" | "devnet";
  rpcUrl?: string;
  allowedMints?: string[];
  onPaymentSuccess?: (signature: string) => void;
  onPaymentError?: (error: Error) => void;
};

export function SkillPaymentButton({
  skillSlug,
  merchantName = "Skill Hub",
  merchantWallet,
  network = "mainnet",
  rpcUrl,
  allowedMints,
  onPaymentSuccess,
  onPaymentError,
}: SkillPaymentButtonProps) {
  return (
    <PaymentButton
      config={{
        merchant: { name: merchantName, wallet: merchantWallet },
        mode: "tip",
        network,
        rpcUrl,
        allowedMints,
        showQR: true,
        theme: {
          borderRadius: 8,
        },
      }}
      onPaymentStart={() => {
        console.info("Skill payment started:", skillSlug);
      }}
      onPaymentSuccess={(signature) => {
        console.info("Skill payment confirmed:", skillSlug, signature);
        onPaymentSuccess?.(signature);
      }}
      onPaymentError={(error) => {
        console.error("Skill payment failed:", skillSlug, error);
        onPaymentError?.(error);
      }}
      onCancel={() => {
        console.info("Skill payment cancelled:", skillSlug);
      }}
    >
      <button type="button">Tip this skill</button>
    </PaymentButton>
  );
}
