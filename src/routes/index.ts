import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/user/user.routes";
import departmentRoutes from "../modules/department/department.routes";
import programRoutes from "../modules/program/program.routes";
import courseRoutes from "../modules/course/course.routes";


const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/departments", departmentRoutes);
router.use("/programs", programRoutes);
router.use("/courses", courseRoutes);


export default router;