import { useParams } from "react-router-dom";
import Placeholder from "@/components/Placeholder.jsx";
export default function Brief() {
  const { region } = useParams();
  return (
    <Placeholder name="8 · Season Brief">
      <p className="text-sm">Region: {region}</p>
    </Placeholder>
  );
}
