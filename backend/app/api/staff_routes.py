"""
School counselor dashboard API. Every route requires a verified staff
email (see app.services.staff_service).
"""

from fastapi import APIRouter, Depends

from app.services import staff_service


router = APIRouter(prefix="/api/v1/staff")

Staff = Depends(staff_service.current_staff_id)


@router.get("/students")
async def staff_students(staff_id: str = Staff):
    return {"students": await staff_service.list_students()}


@router.get("/students/{student_id}")
async def staff_student(student_id: str, staff_id: str = Staff):
    return await staff_service.student_detail(staff_id, student_id)
