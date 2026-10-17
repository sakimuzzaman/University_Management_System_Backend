import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/user/user.routes.js";
import departmentRoutes from "../modules/department/department.routes.js";
import programRoutes from "../modules/program/program.routes.js";
import courseRoutes from "../modules/course/course.routes.js";
import paymentRoutes from "../modules/payment/payment.routes.js";
import academicRoutes from "../modules/academic/academic.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";


const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/departments", departmentRoutes);
router.use("/programs", programRoutes);
router.use("/courses", courseRoutes);
router.use( academicRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);

export default router;