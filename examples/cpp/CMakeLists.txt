cmake_minimum_required(VERSION 3.16)
project(hope_beacon_walk CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Debian/Ubuntu: apt install libcurl4-openssl-dev nlohmann-json3-dev
# macOS: brew install curl nlohmann-json    Windows: vcpkg install curl nlohmann-json
find_package(CURL REQUIRED)
find_package(nlohmann_json 3.2 REQUIRED)

add_executable(walk walk.cpp)
target_link_libraries(walk PRIVATE CURL::libcurl nlohmann_json::nlohmann_json)
