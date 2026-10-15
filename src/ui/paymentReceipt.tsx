import React, { useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";

import { BRAND } from "../brand";
import { shortRecipient } from "../lib/sendFlow";
import { shareImage } from "../services/shareImage";
import { Button, Text, Toggle } from "./components";
import { Sheet, toastError } from "./extras";

export interface Receipt {
  recipient: string;
  amount: string;
  timestamp: number;
  network?: string;
}

/** The exact preview is shared; amounts are hidden until the sender chooses otherwise. */
export function PaymentReceiptSheet({ receipt, visible, onClose }: { receipt: Receipt; visible: boolean; onClose: () => void }) {
  const ref = useRef<Svg>(null);
  const [showAmount, setShowAmount] = useState(false);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (!ref.current || sharing) return;
    setSharing(true);
    try { await shareImage(ref.current, "receipt", 1080, 1200); }
    catch (error) { toastError(error); }
    finally { setSharing(false); }
  };
  return (
    <Sheet visible={visible} onClose={() => !sharing && onClose()} title="Share receipt">
      <View style={{ alignSelf: "center" }}>
        <Svg ref={ref} width={270} height={300} viewBox="0 0 720 800">
          <Rect width={720} height={800} rx={40} fill="#fbf6ec" />
          <SvgText x={56} y={86} fill="#14110f" fontSize={42} fontWeight="800">{BRAND.name}</SvgText>
          <Circle cx={360} cy={224} r={70} fill="#e2f3e9" />
          <Path d="M330 224l21 21 42-46" stroke="#177a4a" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <SvgText x={360} y={352} textAnchor="middle" fill="#14110f" fontSize={46} fontWeight="700">Payment sent</SvgText>
          <SvgText x={360} y={440} textAnchor="middle" fill="#14110f" fontSize={showAmount ? 48 : 28} fontWeight="600" textLength={showAmount && receipt.amount.length > 22 ? 600 : undefined} lengthAdjust="spacingAndGlyphs">
            {showAmount ? receipt.amount : "Paid with Clink"}
          </SvgText>
          <SvgText x={360} y={510} textAnchor="middle" fill="#5e564c" fontSize={25}>{`To ${shortRecipient(receipt.recipient)}`}</SvgText>
          {receipt.network && <SvgText x={360} y={558} textAnchor="middle" fill="#5e564c" fontSize={24}>{receipt.network}</SvgText>}
          <SvgText x={360} y={652} textAnchor="middle" fill="#5e564c" fontSize={23}>{new Date(receipt.timestamp * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</SvgText>
          <SvgText x={360} y={730} textAnchor="middle" fill="#8f5500" fontSize={24}>{BRAND.tagline}</SvgText>
        </Svg>
      </View>
      <Toggle label="Include amount" value={showAmount} onChange={setShowAmount} />
      <Text variant="caption" muted>The image above is what you share.</Text>
      <Button title="Share receipt image" icon="share-2" loading={sharing} onPress={share} />
    </Sheet>
  );
}
