const marks = [
  { left: "2%", top: "8%", size: 34 },
  { left: "11%", top: "61%", size: 22 },
  { left: "20%", top: "18%", size: 43 },
  { left: "31%", top: "68%", size: 27 },
  { left: "40%", top: "5%", size: 25 },
  { left: "49%", top: "48%", size: 38 },
  { left: "61%", top: "13%", size: 21 },
  { left: "69%", top: "63%", size: 33 },
  { left: "78%", top: "7%", size: 29 },
  { left: "86%", top: "49%", size: 42 },
  { left: "91%", top: "16%", size: 20 },
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
