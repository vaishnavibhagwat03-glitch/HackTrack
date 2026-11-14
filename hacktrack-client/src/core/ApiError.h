// One error type for the whole client. `code` is a stable machine name shown
// in the UI and tests ("DeadlinePassed", "InvalidScore", "NetworkError", ...).
#pragma once
#include <stdexcept>
#include <string>

namespace ht {

class ApiError : public std::runtime_error {
public:
    int status;
    std::string code;
    ApiError(int status, std::string code, const std::string& message)
        : std::runtime_error(message), status(status), code(std::move(code)) {}
};

}  // namespace ht
