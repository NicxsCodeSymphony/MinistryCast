import { Outlet} from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function PrivateLayout(){
   return(
    <div className="flex">
        <Sidebar />

        <main className="ml-65 w-full min-h-screen bg-[#050505]">
            <Outlet />
        </main>
    </div>

   ) 
}