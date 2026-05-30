import { NavLink } from "react-router-dom";
import {MinistryCastIcon, DashboardIcon, SetlistsIcon, SongsIcon, PresentationIcon, CategoriesIcon, SettingsIcon} from "../../components/icons"

const navItems = [
    {
        label: "Dashboard",
        to: "/dashboard",
        icon: DashboardIcon,
        iconProps: { width: 18, height: 18 },
    },
    {
        label: "Setlists",
        to: "/setlists",
        icon: SetlistsIcon,
        iconProps: { width: 18, height: 18 },
    },
    {
        label: "Songs",
        to: "/songs",
        icon: SongsIcon,
        iconProps: { width: 12, height: 18 },
    },
    {
        label: "Presentation",
        to: "/",
        icon: PresentationIcon,
        iconProps: { width: 20, height: 16 },
    },
    {
        label: "Categories",
        to: "/",
        icon: CategoriesIcon,
        iconProps: { width: 19, height: 20 },
    },
    {
        label: "Settings",
        to: "/",
        icon: SettingsIcon,
        iconProps: { width: 21, height: 20 },
    },
];

export default function Sidebar({ iconHeight = 40, iconWidth = 40 }) {
    return (
        <div className="w-[260px] h-screen bg-[#181717] text-white fixed left-0 top-0 py-[24px]">
            <div className="flex flex-row gap-[12px] items-center justify-center">
                <div className={`w-[${iconWidth}px] h-[${iconHeight}px]`}>
                    <MinistryCastIcon height={iconHeight} width={iconWidth} />
                </div>
                <div>
                    <h1 className="text-[24px] text-[#9BCBFF] font-bold">MinistryCast</h1>
                    <h3 className="text-[10px] uppercase font-bold text-[#BFC7D3]">Production Suite</h3>
                </div>
            </div>

            <nav className="flex flex-col gap-2 mt-[40px]">
                {navItems.map(({ label, to, icon: Icon, iconProps }) => (
                    <NavLink
                        key={label}
                        to={to}
                        className={({ isActive }) =>
                            `flex items-center h-[48px] pl-[18px] hover:text-blue-400 rounded-lg transition-colors duration-150 ${isActive ? 'bg-[#25292F]' : ''}`
                        }
                    >
                        <Icon {...iconProps} />
                        <span className="pl-[20px] text-[16px] text-[#E5E2E1]">{label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}