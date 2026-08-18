const marks = [
  { left: "-1%", top: "4%", size: 52 },
  { left: "4%", top: "54%", size: 38 },
  { left: "9%", top: "16%", size: 61 },
  { left: "15%", top: "66%", size: 43 },
  { left: "20%", top: "-5%", size: 47 },
  { left: "24%", top: "42%", size: 57 },
  { left: "31%", top: "8%", size: 40 },
  { left: "35%", top: "59%", size: 50 },
  { left: "41%", top: "21%", size: 63 },
  { left: "47%", top: "-3%", size: 36 },
  { left: "51%", top: "55%", size: 55 },
  { left: "58%", top: "13%", size: 46 },
  { left: "62%", top: "64%", size: 40 },
  { left: "67%", top: "-7%", size: 59 },
  { left: "72%", top: "39%", size: 52 },
  { left: "78%", top: "8%", size: 42 },
  { left: "82%", top: "61%", size: 48 },
  { left: "87%", top: "20%", size: 62 },
  { left: "93%", top: "-4%", size: 39 },
  { left: "96%", top: "57%", size: 51 },
] as const;

export function ToolbarWatermark() {
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
