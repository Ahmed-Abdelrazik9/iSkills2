import { Router, type IRouter } from "express";
import healthRouter from "./health";
import iskills2Router from "./iskills2/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/iskills2", iskills2Router);

export default router;
