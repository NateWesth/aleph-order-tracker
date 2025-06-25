
// Generate a unique company code
export const generateCompanyCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Copy company code to clipboard
export const copyToClipboard = (code: string, toast: any) => {
  navigator.clipboard.writeText(code);
  toast({
    title: "Copied to Clipboard",
    description: `Company code ${code} has been copied to clipboard.`,
  });
};
