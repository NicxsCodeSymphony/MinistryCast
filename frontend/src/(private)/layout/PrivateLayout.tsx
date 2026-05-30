import { Outlet} from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function PrivateLayout(){
   return(
    <div className="flex">
        <Sidebar />

        <main className="ml-65 w-full min-h-screen bg-[#050505]">
            <Header />
          <div className="p-[24px]">
              <Outlet />
          </div>
        </main>
    </div>

   ) 
}