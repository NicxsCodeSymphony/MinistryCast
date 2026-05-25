import { Routes, Route} from 'react-router-dom'
import Welcome from './(public)/Welcome'
import './App.css'

function App(){
  return(
    <Routes>
      <Route path="/" element={<Welcome />}></Route>
    </Routes>
  )
}

export default App;