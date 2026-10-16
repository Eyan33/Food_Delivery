function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}


function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email);
}


function isValidPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 8
    );
}


function isValidName(name) {
    return (
        typeof name === "string" &&
        name.trim().length >= 2
    );
}


function isValidPhone(phone) {
    if (
        phone === null ||
        phone === undefined ||
        phone === ""
    ) {
        return true;
    }

    return (
        typeof phone === "string" &&
        phone.trim().length >= 7
    );
}


module.exports = {
    normalizeEmail,
    isValidEmail,
    isValidPassword,
    isValidName,
    isValidPhone
};