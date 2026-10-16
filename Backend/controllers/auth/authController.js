const authService = require("../../services/auth/authService");


async function register(req, res) {
    try {

        const {
            first_name,
            last_name,
            email,
            phone,
            password
        } = req.body;

        const result = await authService.registerUser({
            first_name,
            last_name,
            email,
            phone,
            password
        });

        return res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: result
        });

    } catch (error) {

        console.error("Registration error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "An account with this email or phone already exists"
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}


async function login(req, res) {
    try {

        const {
            email,
            password
        } = req.body;

        const result = await authService.loginUser({
            email,
            password
        });

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: result
        });

    } catch (error) {

        console.error("Login error:", error);

        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
}


async function me(req, res) {
    try {

        const user = await authService.getCurrentUser(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            data: {
                user
            }
        });

    } catch (error) {

        console.error("Get current user error:", error);

        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
}


async function updateMe(req, res) {
    try {
        const user = await authService.updateCurrentUser(
            req.user.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: { user }
        });
    } catch (error) {
        console.error("Update profile error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "An account with this email or phone already exists"
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body || {};

        await authService.changeCurrentUserPassword(
            req.user.id,
            currentPassword,
            newPassword
        );

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });
    } catch (error) {
        console.error("Change password error:", error);

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}



module.exports = {
    register,
    login,
    me,
    updateMe,
    changePassword
};