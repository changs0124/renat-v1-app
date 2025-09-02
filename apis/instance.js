import axios from "axios";

export const instance = axios.create({
    baseURL: "http://192.168.0.7:8080/api/v1",
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
})

// export const instance = axios.create({
//     baseURL: "http://222.234.4.177:8080/api/v1",
//     headers: {
//         "Content-Type": "application/json",
//         "Accept": "application/json"
//     }
// })