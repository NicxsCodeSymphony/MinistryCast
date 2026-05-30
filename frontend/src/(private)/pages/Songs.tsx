import {AddSongIcon} from "../../components/icons"

const SongsPage = () => {

    return(
        <div className="flex">

            <div className="w-1/2">

                <div className="flex justify-between">
                    
                    <div>
                        <h2 className="primary-text-color">Song Library</h2>
                    <p>248 total songs</p>

                    </div>
                    <div className="flex-end">
                   <div>
                    <AddSongIcon />
                     <button className="primary-text-color">Add Song</button>
                   </div>
                </div>
                </div>
            </div>

        </div>
    )

}

export default SongsPage