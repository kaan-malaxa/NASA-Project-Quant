import { useParams } from "react-router-dom";
import Placeholder from "@/components/Placeholder.jsx";
export default function Region() {
  const { region } = useParams();
  return (
    <Placeholder name="Region story">
      <p className="text-sm">Region: {region}</p>
    </Placeholder>
  );
}
