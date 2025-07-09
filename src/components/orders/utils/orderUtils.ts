
// Utility functions for order operations

export const generateOrderNumber = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');
  const millisecond = date.getMilliseconds().toString().padStart(3, '0');
  
  // Use timestamp + random number + performance.now() for better uniqueness
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const performanceTime = Math.floor(performance.now() * 1000).toString().slice(-4);
  
  return `ORD-${year}${month}${day}-${hour}${minute}${second}${millisecond}-${random}${performanceTime}`;
};
