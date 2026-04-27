# Demo-oclock
Chương trình sử dụng đồng hồ hệ thống (system clock) làm mốc thời gian ban đầu, sau đó mô phỏng sự lệch thời gian giữa các node bằng offset. Việc đồng bộ được thực hiện theo thuật toán Berkeley mà không can thiệp trực tiếp vào clock của hệ điều hành. Đê tránh làm biến động các chương trình bên trong hệ điều hành, gây ra hư hỏng và làm chậm các tiến trình của máy đang xử lý.
