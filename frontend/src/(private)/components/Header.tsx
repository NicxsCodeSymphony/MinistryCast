import { SearchIcon, OfflineIcon, NotificationBellIcon} from "../../components/icons"

const Header = () => {
    return(
        <header className="w-full h-[64px] border-b border-white/10  flex flex-row items-center justify-between px-[24px]">
                    <div className="bg-[#1C1B1B] rounded-full border border-white/10 w-[256px] h-[34px] flex items-center  pl-[12px]">
                        <SearchIcon />

                        <input className="w-full h-full bg-transparent border-none outline-none text-white text-[14px] text-[#6B7280]" placeholder="Search" />
                    </div>

                    <div className="flex gap-[16px] items-center h-[36px]">
                        <div className="bg-[#E9C349]/10 text-[#E9C349] rounded-full border border-[#E9C349]/20 w-[170px] h-[30px] flex items-center justify-center gap-[8px]">
                            <OfflineIcon />
                            <h4 className="text-[12px] font-medium">Sync Status (Offline)</h4>
                        </div>
                        
                        <div className="w-[32px] h-full  flex items-center justify-center">
                            <NotificationBellIcon />
                        </div>

                        <div className="h-full w-[17px]">
                            <div className="w-[1px] border border-white/10 h-full"></div>
                        </div>

                        <div className="w-[140px] h-full flex items-center justify-center rounded-[8px]" style={{ background: 'linear-gradient(90deg, #9BCBFF 0%, #7900CD 100%)' }}>
                            <h4 className="text-[12px] text-[#003256] font-bold">Start Presentation</h4>
                        </div>

                        <div className="h-full w-[32px] rounded-full flex justify-center items-center border border-white/10"></div>
                    </div>


                </header>
    )
}

export default Header