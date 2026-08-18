import { useTheme } from "@/contexts/ThemeContext";

const marks = [
  { left: "-2%", top: "-18%", size: 66 },
  { left: "1%", top: "46%", size: 58 },
  { left: "5%", top: "5%", size: 72 },
  { left: "8%", top: "58%", size: 52 },
  { left: "11%", top: "-12%", size: 61 },
  { left: "15%", top: "35%", size: 69 },
  { left: "18%", top: "-22%", size: 55 },
  { left: "21%", top: "52%", size: 64 },
  { left: "25%", top: "3%", size: 73 },
  { left: "28%", top: "62%", size: 50 },
  { left: "31%", top: "-15%", size: 65 },
  { left: "35%", top: "39%", size: 70 },
  { left: "38%", top: "-25%", size: 54 },
  { left: "41%", top: "54%", size: 63 },
  { left: "45%", top: "7%", size: 74 },
  { left: "48%", top: "64%", size: 49 },
  { left: "51%", top: "-16%", size: 66 },
  { left: "55%", top: "37%", size: 71 },
  { left: "58%", top: "-23%", size: 53 },
  { left: "61%", top: "56%", size: 62 },
  { left: "65%", top: "4%", size: 73 },
  { left: "68%", top: "63%", size: 51 },
  { left: "71%", top: "-14%", size: 67 },
  { left: "75%", top: "40%", size: 69 },
  { left: "78%", top: "-24%", size: 55 },
  { left: "81%", top: "55%", size: 64 },
  { left: "85%", top: "6%", size: 72 },
  { left: "88%", top: "62%", size: 50 },
  { left: "91%", top: "-13%", size: 66 },
  { left: "95%", top: "38%", size: 70 },
  { left: "98%", top: "-21%", size: 54 },
] as const;

export function ToolbarWatermark() {
  const { toolbarWatermark } = useTheme();

  if (!toolbarWatermark) return null;

  return (
    <div className="aleph-toolbar-watermark" aria-hidden="true">
      {marks.map((mark, index) => (
        <img
          key={index}
          src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
          alt=""
          draggable={false}
          style={{ left: mark.left, top: mark.top, width: mark.size, height: mark.size }}
        />
      ))}
    </div>
  );
}

export default ToolbarWatermark;
